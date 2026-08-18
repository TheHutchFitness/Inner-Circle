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
    "av_wolf": "feral werewolf-themed athlete with silver fur hood and glowing eyes.",
    "av_ghost": "spectral pale phantom lifter, translucent hood, eerie blue ghost aura.",
    "av_dragon": "dragon-armored warrior with scaled pauldrons and molten blue breath.",
    "av_hutch": "legendary crowned coach champion, golden-blue royal aura, veteran powerlifter.",
    "av_berserker": "raging viking berserker with dual axes and wild energy, blue war paint.",
    "av_samurai": "armored samurai athlete with a katana and flowing banner, neon accents.",
    "av_mecha": "half-cyborg mecha athlete with glowing blue mechanical arm and visor.",
    "av_thunder": "thunder-god fighter wielding crackling blue lightning, storm clouds.",
    "av_kraken": "deep-sea kraken warrior with tentacle motifs and bioluminescent blue glow.",
    "av_ace": "sharp gambler ace fighter, card motifs, cocky grin, neon-blue suit accents.",
    "av_star": "celestial star-saint athlete radiating cosmic blue starlight, halo of stars.",
    "av_oni": "towering blue-skinned oni demon lifter with horns and iron club, fierce.",
}

async def gen(k, d):
    chat = LlmChat(api_key=API_KEY, session_id=f"av2-{k}", system_message="You are an expert anime character concept artist.")
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
