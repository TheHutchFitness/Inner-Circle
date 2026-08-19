import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image
from gen_weapons import key_and_place  # reuse chroma-key + side placement

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
SKIN_OUT = "/app/frontend/assets/images/skins"
WEAP_OUT = "/app/frontend/assets/images/weapons"

STYLE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible, character-select screen art in the style of Fortnite / Overwatch / "
    "Valorant — clearly NON-photorealistic, smooth cel-shaded stylized shading, semi-cartoon "
    "proportions, clean crisp outlines, vibrant polished game-art look. Dark charcoal background "
    "with a subtle blue rim light. Full character, centered. No text, no logos, no border. Character: "
)

QUEST_SKINS = {
    "skin_shadow": "a shadow assassin in a sleek black hooded stealth suit with glowing purple eyes and wisps of dark smoke.",
    "skin_flame": "a flame berserker warrior engulfed in a fiery orange aura, scorched dark armor and burning fists.",
    "skin_frost": "a frost sovereign in icy pale-blue crystalline armor with a frozen cape and a glowing cold aura.",
    "skin_celestial": "a celestial ascended hero glowing with golden divine light, a radiant halo and ethereal white-gold robes.",
}
QUEST_WEAPONS = {
    "w_shadowblade": "a black shadow katana wreathed in purple smoke",
    "w_soulscythe": "a large soul-reaper scythe with a glowing green ethereal blade",
    "w_stormspear": "a crackling lightning storm spear glowing with blue electricity",
}


async def gen_skin(key, desc):
    chat = LlmChat(api_key=API_KEY, session_id=f"qskin-{key}", system_message="You are a stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=STYLE + desc))
    if imgs:
        Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(f"{SKIN_OUT}/{key}.png")
        print("OK", key)
    else:
        print("FAIL", key)


async def gen_weap(key, desc):
    prompt = (
        f"{desc}. A stylized 3D video-game weapon icon, cel-shaded, glossy, clean crisp outlines. "
        "The WEAPON ONLY — no hands, no person, no text. Oriented mostly VERTICAL, centered. "
        "Isolated on a solid pure magenta #FF00FF background; fill ALL empty space with flat solid magenta #FF00FF."
    )
    chat = LlmChat(api_key=API_KEY, session_id=f"qweap-{key}", system_message="You are a stylized video-game weapon concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        key_and_place(base64.b64decode(imgs[0]["data"])).save(f"{WEAP_OUT}/{key}.png")
        print("OK", key)
    else:
        print("FAIL", key)


async def main():
    for k, d in QUEST_SKINS.items():
        try: await gen_skin(k, d)
        except Exception as e: print("ERR", k, str(e)[:60])
    for k, d in QUEST_WEAPONS.items():
        try: await gen_weap(k, d)
        except Exception as e: print("ERR", k, str(e)[:60])


if __name__ == "__main__":
    asyncio.run(main())
