import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images/skins"
os.makedirs(OUT, exist_ok=True)

STYLE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible (head, torso, legs and feet all in frame), character-select screen "
    "art in the style of Fortnite / Overwatch / Valorant — clearly NON-photorealistic, smooth "
    "cel-shaded stylized shading, semi-cartoon proportions, clean crisp outlines, vibrant polished "
    "game-art look. Dark charcoal background with a subtle blue rim light. Full character, centered. "
    "No text, no logos, no watermark, no border. Character: "
)

FREE = {
    "skin_anime": "a colourful anime hero in a stylish spiky-haired anime battle outfit with a scarf.",
    "skin_knight": "a medieval knight in polished steel plate armor with a coloured tabard and a closed helm.",
    "skin_cyber": "a cyberpunk street hero in neon-lit techwear jacket with glowing cybernetic augments.",
    "skin_space": "an astronaut in a sleek white sci-fi spacesuit with a rounded glass helmet and blue accents.",
    "skin_ancient": "an ancient bronze gladiator warrior in leather-and-bronze armor with a plumed helm.",
    "skin_monk": "a martial-arts monk in simple earthy robes with a cloth sash and wrapped forearms.",
    "skin_arcade": "a retro arcade video-game hero in a colourful pixel-inspired outfit with bright neon accents.",
}


async def gen(key, desc):
    chat = LlmChat(api_key=API_KEY, session_id=f"fskin-{key}", system_message="You are a stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=STYLE + desc))
    if not imgs:
        print("FAIL", key, (t or "")[:60]); return
    Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(f"{OUT}/{key}.png")
    print("OK", key)


async def main():
    for k, d in FREE.items():
        for attempt in range(2):
            try:
                await gen(k, d); break
            except Exception as e:
                print("ERR", k, str(e)[:60]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
