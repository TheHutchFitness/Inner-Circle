import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
SKIN_OUT = "/app/frontend/assets/images/skins"

STYLE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible, character-select screen art in the style of Fortnite / Overwatch / "
    "Valorant — clearly NON-photorealistic, smooth cel-shaded stylized shading, semi-cartoon "
    "proportions, clean crisp outlines, vibrant polished game-art look. Dark charcoal background "
    "with a subtle blue rim light. Full character, centered. No text, no logos, no border. Character: "
)

NEW_SKINS = {
    "skin_venom": "a venom warden in sleek toxic-green bio-armor dripping with glowing acid, hooded with radioactive green eyes and swirling poison mist.",
    "skin_storm": "a storm reaver warrior clad in dark cobalt plate crackling with blue lightning, an electric aura arcing around raised fists and a charged stormcloud cape.",
    "skin_abyss": "an abyss leviathan hero in deep-sea armor of dark teal chitin and glowing bioluminescent cyan veins, with tentacle-like shoulder plates and an eerie underwater glow.",
    "skin_solar": "a solar titan blazing with molten gold and crimson fire, radiant sun-forged armor emitting brilliant orange light, a flaming solar halo behind the head.",
}


async def gen_skin(key, desc):
    chat = LlmChat(api_key=API_KEY, session_id=f"nqskin-{key}", system_message="You are a stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=STYLE + desc))
    if imgs:
        Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(f"{SKIN_OUT}/{key}.png")
        print("OK", key)
    else:
        print("FAIL", key)


async def main():
    for k, d in NEW_SKINS.items():
        try:
            await gen_skin(k, d)
        except Exception as e:
            print("ERR", k, str(e)[:80])


if __name__ == "__main__":
    asyncio.run(main())
