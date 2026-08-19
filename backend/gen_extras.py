import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
IMG = "/app/frontend/assets/images"
SKINS = f"{IMG}/skins"

FULLBODY = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible, character-select screen art in the style of Fortnite / Overwatch / "
    "Valorant — clearly NON-photorealistic, smooth cel-shaded stylized shading, semi-cartoon "
    "proportions, clean crisp outlines, vibrant polished game-art look. Dark charcoal background "
    "with a subtle blue rim light. Full character, centered. No text, no logos, no border. "
)

BASE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible (head, torso, legs and feet all in frame), character-select screen "
    "art in the style of Fortnite / Overwatch / Valorant / Pixar — clearly NON-photorealistic, "
    "smooth cel-shaded stylized shading, semi-cartoon proportions, glossy stylized hair, clean crisp "
    "outlines, vibrant polished game-art look. A fit healthy adult standing relaxed and facing the "
    "camera with a calm confident expression. Plain fitted grey crew-neck t-shirt with plain dark "
    "athletic joggers and simple sneakers. Dark charcoal background with a subtle blue rim light. "
    "No text, no logos, no watermark, no border, no props. "
)

RACES = {
    "white":  ("White Caucasian", "short"),
    "black":  ("Black African", "short"),
    "asian":  ("East Asian", "short straight"),
    "native": ("Native American Indigenous", "long straight"),
    "indian": ("South Asian Indian", "short"),
}
HAIR = {"black": "black", "brown": "brown", "blonde": "blonde", "red": "ginger red", "white": "platinum white"}


async def one(prompt, path):
    if os.path.exists(path):
        print("skip", os.path.basename(path)); return
    chat = LlmChat(api_key=API_KEY, session_id=f"x-{os.path.basename(path)}", system_message="You are an expert stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(path)
        print("OK", os.path.basename(path))
    else:
        print("FAIL", os.path.basename(path))


async def main():
    # Seasonal boss skin
    await one(FULLBODY + "Character: an abyssal void overlord boss champion in ornate black-and-violet "
              "cosmic armor with glowing purple void energy, a horned crown and a flowing dark cape.",
              f"{SKINS}/skin_season1.png")
    # Male beard variants across races x hair colours
    for race, (eth, style) in RACES.items():
        for hid, hword in HAIR.items():
            path = f"{IMG}/av_{race}_{hid}_beard.png"
            prompt = BASE + f"Subject: a {eth} man with {style} {hword} hair and a full thick {hword} beard."
            for attempt in range(2):
                try:
                    await one(prompt, path); break
                except Exception as e:
                    print("ERR", path, str(e)[:50]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
