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

SKINS = {
    "skin_dragonknight": "an armored Dragon Knight hero in ornate interlocking dragon-scale plate armor, a horned dragon helm and a flowing crimson cape, standing heroically.",
    "skin_dbz": "a super-saiyan anime warrior with spiky glowing golden hair, a blue-and-orange martial-arts gi, and a bright energy aura crackling around the body.",
    "skin_mecha": "a mecha pilot wearing a sleek high-tech powered exosuit with glowing panel lights and armored plating, sci-fi hero.",
    "skin_cod": "a modern military special-forces soldier in full tactical gear: combat helmet, plate carrier vest, cargo pants and boots, rugged operator look.",
    "skin_halo": "a futuristic space super-soldier in bulky green power armor with a golden visored helmet, heavy armored plating, heroic stance.",
    "skin_viking": "a fierce viking warrior with fur-lined cloak, braided beard, leather-and-iron armor, arm bracers and rugged boots.",
    "skin_mercy": "an angelic winged battle-medic in radiant white-and-gold valkyrie armor with a glowing halo and a healing staff, feathered wings.",
    "skin_wsm": "the world's strongest man, a massive muscular strongman bodybuilder in a lifting singlet and belt, chalked hands, enormous physique.",
    "skin_mk": "a masked martial-arts kombat ninja fighter in a dark combat outfit with mask and sash, dramatic fighting stance.",
    "skin_aot": "a scout-regiment soldier in a brown leather harness rig with a hooded green cloak and twin blade handles, anime military hero.",
}


async def gen(key, desc):
    chat = LlmChat(api_key=API_KEY, session_id=f"skin-{key}", system_message="You are a stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=STYLE + desc))
    if not imgs:
        print("FAIL", key, (t or "")[:60]); return
    im = Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB")
    im.save(f"{OUT}/{key}.png")
    print("OK", key)


async def main():
    for k, d in SKINS.items():
        for attempt in range(2):
            try:
                await gen(k, d); break
            except Exception as e:
                print("ERR", k, str(e)[:60]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
