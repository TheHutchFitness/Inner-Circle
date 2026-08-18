import asyncio
import os
import base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

STYLE = (
    "Vertical 9:16 mobile phone wallpaper, anime hero aesthetic fused with a hardcore "
    "cyberpunk powerlifting gym. Cinematic, high-contrast, dramatic rim lighting, volumetric haze, "
    "deep near-black background with strong negative space in the TOP THIRD for UI text overlay. "
    "A lone muscular anime warrior-athlete silhouette positioned lower/side of frame. No text, no logos, no watermark. "
)

BGS = {
    "bg_default": "Cool electric-blue neon accents, steel and black, disciplined calm powerful mood.",
    "bg_cyber": "Bright cyan holographic grid lines, glowing floor, futuristic cyber dojo energy.",
    "bg_toxic": "Radioactive toxic-green neon glow, smoky, aggressive underground gym vibe.",
    "bg_inferno": "Blazing orange and crimson embers, fiery aura around the hero, intense inferno mood.",
    "bg_void": "Deep violet cosmic nebula and purple energy, mystical void, ethereal super-saiyan aura.",
    "bg_freak": "Menacing blood-red and pitch black, crackling dark energy, demonic beast-mode final-form aura.",
}


async def gen(bg_id: str, desc: str):
    chat = LlmChat(api_key=API_KEY, session_id=f"bg-{bg_id}", system_message="You are an expert concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=STYLE + desc)
    text, images = await chat.send_message_multimodal_response(msg)
    if images:
        img = images[0]
        with open(f"{OUT}/{bg_id}.png", "wb") as f:
            f.write(base64.b64decode(img["data"]))
        print(f"OK {bg_id} -> {img['mime_type']}")
    else:
        print(f"FAIL {bg_id}: no image. text={text[:80]}")


async def main():
    for bg_id, desc in BGS.items():
        try:
            await gen(bg_id, desc)
        except Exception as e:
            print(f"ERR {bg_id}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
