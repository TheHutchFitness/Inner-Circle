import asyncio, os, base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

STYLE = (
    "Square 1:1 anime video-game character-select portrait, waist-up hero shot. "
    "Hardcore cyberpunk powerlifter athlete, muscular anime hero, dramatic blue neon rim light, "
    "deep near-black background with subtle gym/tech glow, cel-shaded high-detail anime style, "
    "confident heroic pose, cinematic. No text, no logos, no watermark, no border. Character: "
)

AV = {
    "av_ronin": "masked stealthy ninja ronin, dark hood, glowing blue eyes.",
    "av_kaido": "fierce warrior with wild dark hair and a dragon tattoo, teal energy aura.",
    "av_titan": "massive stoic bald strongman, granite build, calm intimidating stare.",
    "av_saiyan": "spiky-haired anime fighter crackling with electric golden-blue energy.",
    "av_demon": "red-skinned oni demon athlete with horns and menacing grin, ember glow.",
    "av_shinobi": "sleek cyber-ninja with a katana on back, neon-blue circuit accents.",
    "av_phoenix": "heroic athlete wreathed in blue phoenix flames, wings of fire.",
    "av_reaper": "hooded skull-faced reaper lifter, cold blue soul-fire eyes.",
}

async def gen(k, d):
    chat = LlmChat(api_key=API_KEY, session_id=f"av-{k}", system_message="You are an expert anime character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=STYLE + d))
    if imgs:
        with open(f"{OUT}/{k}.png", "wb") as f:
            f.write(base64.b64decode(imgs[0]["data"]))
        print("OK", k)
    else:
        print("FAIL", k, t[:60])

async def main():
    for k, d in AV.items():
        try: await gen(k, d)
        except Exception as e: print("ERR", k, e)

asyncio.run(main())
