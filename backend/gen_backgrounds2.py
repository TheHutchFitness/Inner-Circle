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
    "bg_vanguard": "Electric sapphire-blue plasma and polished chrome, disciplined elite-guard aura, sharp tactical energy, cold precise power.",
    "bg_warrior": "Molten bronze and battle-worn steel, golden war sparks, gladiator arena dust, relentless warrior intensity.",
    "bg_boss": "Ominous emerald-and-obsidian throne room, crackling dark-green energy, looming final-boss menace and dominance.",
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
