
import os
import requests

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient

OLLAMA = os.getenv("OLLAMA_URL", "http://ollama:11434")
QDRANT = os.getenv("QDRANT_URL", "http://qdrant:6333")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:0.6b")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3:4b")
COLLECTION = os.getenv("COLLECTION", "bible_luther_1912")

app = FastAPI(title="Local Bible RAG")
db = QdrantClient(url=QDRANT)

class Question(BaseModel):
    question: str
    top_k: int = 5

@app.post("/ask")
def ask(request: Question):
    try:
        response = requests.post(
            f"{OLLAMA}/api/embed",
            json={
                "model": EMBED_MODEL,
                "input": request.question
            },
            timeout=180
        )
        response.raise_for_status()
        query_vector = response.json()["embeddings"][0]

        hits = db.query_points(
            collection_name=COLLECTION,
            query=query_vector,
            limit=max(1, min(request.top_k, 15)),
            with_payload=True
        ).points

        sources = [
            {
                "reference": hit.payload["ref"],
                "text": hit.payload["text"],
                "score": hit.score
            }
            for hit in hits
        ]

        if not sources:
            return {
                "answer": "Keine passenden Bibelstellen gefunden.",
                "sources": []
            }

        context = "\n\n".join(
            f"[{s['reference']}]\n{s['text']}"
            for s in sources
        )

        system_prompt = """
Du bist ein Assistent für die Analyse der Bibel.

Regeln:
- Antworte auf Deutsch.
- Verwende ausschließlich die bereitgestellten Bibeltexte
  als Beleg für biblische Aussagen.
- Erfinde keine Bibelstellen oder Zitate.
- Nenne die Fundstellen zu deinen Aussagen.
- Unterscheide zwischen Textinhalt und Interpretation.
- Wenn die Quellen nicht ausreichen, sage das ausdrücklich.
- Der verwendete Text ist die Lutherbibel von 1912.
"""

        prompt = f"""
Bibelstellen:
{context}

Frage:
{request.question}

Antworte präzise mit Quellenangaben.
"""

        result = requests.post(
            f"{OLLAMA}/api/chat",
            json={
                "model": LLM_MODEL,
                "stream": False,
                "options": {"temperature": 0.1},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            },
            timeout=300
        )
        result.raise_for_status()

        return {
            "answer": result.json()["message"]["content"],
            "sources": sources
        }

    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
