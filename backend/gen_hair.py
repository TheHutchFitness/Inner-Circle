import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

BASE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible (head, torso, legs and feet all in frame), character-select screen "
    "art in the style of Fortnite / Overwatch / Valorant / Pixar — clearly NON-photorealistic, "
    "smooth cel-shaded stylized shading, semi-cartoon proportions, glossy stylized hair, clean crisp "
    "outlines, vibrant polished game-art look. A fit healthy adult standing relaxed and facing the "
    "camera with a calm confident expression. Plain fitted grey crew-neck t-shirt with plain dark "
    "athletic joggers and simple sneakers (basic everyday clothing, no logos). Dark charcoal "
    "background with a subtle blue rim light. Do NOT make it a real photograph. No text, no logos, "
    "no watermark, no border, no props. "
)

# race -> (ethnicity, hair length/style)
RACES = {
    "white":  ("White Caucasian", "short"),
    "black":  ("Black African", "short"),
    "asian":  ("East Asian", "short straight"),
    "native": ("Native American Indigenous", "long straight"),
    "indian": ("South Asian Indian", "short"),
}
HAIR = {
    "black":  "black",
    "brown":  "brown",
    "blonde": "blonde",
    "red":    "ginger red",
    "white":  "platinum white",
}


async def gen(race, eth, style, hair_id, hair_word, female):
    suffix = "_f" if female else ""
    path = f"{OUT}/av_{race}_{hair_id}{suffix}.png"
    if os.path.exists(path):
        print("skip", os.path.basename(path)); return
    who = "woman" if female else "man"
    prompt = BASE + f"Subject: a {eth} {who} with {style} {hair_word} hair."
    chat = LlmChat(api_key=API_KEY, session_id=f"hair-{race}-{hair_id}{suffix}", system_message="You are an expert stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(path)
        print("OK", os.path.basename(path))
    else:
        print("FAIL", os.path.basename(path))


async def main():
    for race, (eth, style) in RACES.items():
        for hair_id, hair_word in HAIR.items():
            for female in (False, True):
                for attempt in range(2):
                    try:
                        await gen(race, eth, style, hair_id, hair_word, female); break
                    except Exception as e:
                        print("ERR", race, hair_id, female, str(e)[:50]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
