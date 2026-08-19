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
    "athletic joggers and simple sneakers (basic everyday clothing, no logos, no patterns). Dark "
    "charcoal background with a subtle blue rim light. Do NOT make it a real photograph — it must "
    "look like a rendered animated video-game character. No text, no logos, no watermark, no border, "
    "no props, no accessories. "
)

LOOKS = {
    "av_white":  ("White Caucasian", "short brown hair"),
    "av_black":  ("Black African", "short black hair"),
    "av_asian":  ("East Asian", "short straight black hair"),
    "av_native": ("Native American Indigenous", "long straight black hair"),
    "av_indian": ("South Asian Indian", "short black hair"),
}


async def gen(fname, ethnicity, hair, female):
    suffix = "_f" if female else ""
    who = "woman" if female else "man"
    prompt = BASE + f"Subject: a {ethnicity} {who} with {hair}."
    chat = LlmChat(api_key=API_KEY, session_id=f"b5-{fname}{suffix}", system_message="You are an expert stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(f"{OUT}/{fname}{suffix}.png")
        print("OK", fname + suffix)
    else:
        print("FAIL", fname + suffix)


async def main():
    for fname, (eth, hair) in LOOKS.items():
        for female in (False, True):
            for attempt in range(2):
                try:
                    await gen(fname, eth, hair, female); break
                except Exception as e:
                    print("ERR", fname, female, str(e)[:60]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
