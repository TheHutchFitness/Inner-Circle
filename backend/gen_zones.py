import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images/zones"
os.makedirs(OUT, exist_ok=True)

BASE = (
    "Wide cinematic 16:9 landscape matte-painting concept art, digital painting, NO people, NO "
    "characters, NO text, NO logos, NO watermark, NO borders. Cyberpunk + anime aesthetic fused with "
    "a hardcore powerlifting / strength-training theme. Moody dramatic lighting, deep blue and black "
    "palette with vivid neon accents, atmospheric depth and haze, painterly video-game world backdrop "
    "suitable as a scrolling RPG map background. Environment only. "
)

ZONES = {
    "zone_0": (
        "THE WASTES — a bleak post-apocalyptic wasteland at dusk: cracked desert ground, rusted "
        "barbells and abandoned weight plates half-buried in sand, a ruined open-air gym with broken "
        "power racks, distant crumbling ruins, dusty amber-and-blue sky."
    ),
    "zone_1": (
        "IRON VALLEY — a hardcore industrial foundry valley: towering steel factories, glowing forge "
        "furnaces, stacks of iron plates and barbells, chains and gears, warehouse gym silhouettes, "
        "sparks and smoke, cold steel-blue neon glow."
    ),
    "zone_2": (
        "STORM RIDGE — a towering stormy mountain-ridge cyber-city: jagged peaks, lightning strikes, "
        "neon skyscrapers clinging to cliffs, an elevated arena gym platform, rolling storm clouds, "
        "electric blue and violet glow."
    ),
    "zone_3": (
        "EMBER PEAKS — volcanic ember mountains: molten lava rivers, glowing embers drifting in the "
        "air, obsidian rock, a fiery mountaintop training temple, dark sky lit by orange-red fire with "
        "cool blue neon rim light."
    ),
    "zone_4": (
        "CRIMSON CITADEL — a grand crimson fortress-coliseum temple of strength: massive stone columns "
        "and arches, banners, a royal arena, gold-and-crimson accents, imposing citadel skyline, regal "
        "dramatic lighting with deep blue shadows."
    ),
    "zone_5": (
        "ASCENSION — a celestial skyward arena above the clouds: floating luminous platforms, radiant "
        "godlike light beams, ethereal starry cosmos, a heavenly temple of power, brilliant white-blue "
        "glow, transcendent and epic."
    ),
}


async def gen(fname, scene):
    prompt = BASE + "Scene: " + scene
    chat = LlmChat(api_key=API_KEY, session_id=f"zone-{fname}", system_message="You are an expert cinematic environment concept artist for AAA games.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        img = Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB")
        img.save(f"{OUT}/{fname}.png")
        print("OK", fname, img.size)
    else:
        print("FAIL", fname)


async def main():
    for fname, scene in ZONES.items():
        for attempt in range(3):
            try:
                await gen(fname, scene); break
            except Exception as e:
                print("ERR", fname, str(e)[:80]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
