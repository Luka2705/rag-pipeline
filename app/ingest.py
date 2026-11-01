
import json
import os
import time
import uuid

import requests
from qdrant_client import QdrantClient, models

OLLAMA = os.getenv("OLLAMA_URL", "http://ollama:11434")
QDRANT = os.getenv("QDRANT_URL", "http://qdrant:6333")
EMBED_MODEL = os.getenv("EMBED_MODEL", "qwen3-embedding:0.6b")
COLLECTION = os.getenv("COLLECTION", "bible_luther_1912")

def embed(text):
    r = requests.post(
        f"{OLLAMA}/api/embed",
        json={"model": EMBED_MODEL, "input": text},
        timeout=180
    )
    r.raise_for_status()
    return r.json()["embeddings"][0]

def main():
    with open("/app/data/luth1912.json", encoding="utf-8") as f:
        bible = json.load(f)

    chunks = []

    for book in bible["books"]:
        for chapter in book["chapters"]:
            verses = chapter["verses"]

            for i in range(0, len(verses), 5):
                group = verses[i:i + 5]
                start = group[0]["number"]
                end = group[-1]["number"]

                ref = f"{book['book']} {chapter['chapter']}:{start}-{end}"
                text = " ".join(
                    f"{v['number']} {v['text']}" for v in group
                )

                chunks.append({
                    "ref": ref,
                    "book": book["book"],
                    "book_id": book["bookId"],
                    "chapter": chapter["chapter"],
                    "verse_start": start,
                    "verse_end": end,
                    "testament": book["testament"],
                    "text": text
                })

    print(f"{len(chunks)} Chunks erstellt", flush=True)

    client = QdrantClient(url=QDRANT, timeout=180)

    dimension = len(embed("Beispieltext"))

    if client.collection_exists(COLLECTION):
        client.delete_collection(COLLECTION)

    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=models.VectorParams(
            size=dimension,
            distance=models.Distance.COSINE
        )
    )

    batch = []

    for i, chunk in enumerate(chunks):
        vector = embed(chunk["text"])

        batch.append(models.PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk["ref"])),
            vector=vector,
            payload=chunk
        ))

        if len(batch) >= 32 or i == len(chunks) - 1:
            client.upsert(
                collection_name=COLLECTION,
                points=batch,
                wait=True
            )
            batch = []

        if (i + 1) % 100 == 0:
            print(f"{i + 1}/{len(chunks)} indexiert", flush=True)

    print("Bibel vollständig indexiert", flush=True)

if __name__ == "__main__":
    main()
