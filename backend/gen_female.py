import asyncio, os, base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

AV_STYLE = (
    "Square 1:1 anime video-game character-select portrait, waist-up hero shot. "
    "Strong heroic FEMALE cyberpunk powerlifter athlete, athletic muscular anime heroine, dramatic blue neon rim light, "
    "deep near-black background with subtle gym/tech glow, cel-shaded high-detail anime style, confident heroic pose, "
    "cinematic. No text, no logos, no watermark, no border. Character: "
)
AV = {
    "av_ronin": "masked stealthy female kunoichi ronin, dark hood, glowing blue eyes.",
    "av_kaido": "fierce female warrior with wild dark hair and a dragon tattoo, teal energy aura.",
    "av_titan": "towering muscular female strongwoman, calm intimidating stare, granite build.",
    "av_saiyan": "spiky-haired female anime fighter crackling with electric golden-blue energy.",
    "av_demon": "red-skinned female oni demon athlete with horns and fierce grin, ember glow.",
    "av_wolf": "fierce female werewolf athlete, silver fur mane, glowing blue eyes.",
    "av_ghost": "ethereal female spectre athlete, translucent cold-blue glow.",
    "av_dragon": "heroic female athlete wreathed in blue dragon fire.",
    "av_shinobi": "sleek female cyber-ninja with katana on back, neon-blue circuit accents.",
    "av_berserker": "raging female berserker warrior with battle axe, blue war paint.",
    "av_phoenix": "heroic female athlete wreathed in blue phoenix flames, wings of fire.",
    "av_oni": "female oni demon athlete with horns, menacing grin, ember glow.",
    "av_samurai": "noble female samurai athlete in glowing neon-blue armor.",
    "av_mecha": "female mecha-suit pilot athlete, glowing blue tech armor.",
    "av_reaper": "hooded female skull-faced reaper lifter, cold blue soul-fire eyes.",
    "av_thunder": "female thunder goddess athlete crackling with blue lightning.",
    "av_kraken": "female deep-sea warrior athlete with kraken tentacles, dark-blue aura.",
    "av_ace": "female card-master athlete, sly grin, neon-blue suit motifs.",
    "av_star": "radiant female star-saint athlete glowing with celestial blue light.",
}

BG_STYLE = (
    "Vertical 9:16 mobile wallpaper, anime heroine aesthetic fused with a hardcore cyberpunk powerlifting gym. "
    "Cinematic, high-contrast, dramatic rim lighting, volumetric haze, deep near-black background with strong "
    "negative space in the TOP THIRD for UI text. A lone muscular anime FEMALE warrior-athlete silhouette lower/side "
    "of frame. No text, no logos, no watermark. "
)
BG = {
    "bg_default": "cool midnight steel-blue tones, disciplined foundational energy.",
    "bg_cyber": "electric cyan cyber-grid, holographic data lines.",
    "bg_toxic": "toxic green surge energy, radioactive glow.",
    "bg_inferno": "crimson inferno embers and heat haze.",
    "bg_vanguard": "electric sapphire-blue plasma and chrome, disciplined elite-guard aura.",
    "bg_warrior": "molten bronze and battle-worn steel, golden war sparks, gladiator arena.",
    "bg_boss": "ominous emerald-and-obsidian throne room, dark-green power, final-boss menace.",
    "bg_void": "deep violet cosmic void, swirling nebula energy.",
    "bg_freak": "blood-red freak-mode aura, overwhelming raw power.",
}


async def gen(k, d, style, session):
    chat = LlmChat(api_key=API_KEY, session_id=session, system_message="You are an expert anime concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=style + d))
    if imgs:
        with open(f"{OUT}/{k}_f.png", "wb") as f:
            f.write(base64.b64decode(imgs[0]["data"]))
        print("OK", k)
    else:
        print("FAIL", k, (t or "")[:60])


async def main():
    for k, d in AV.items():
        try:
            await gen(k, d, AV_STYLE, f"favf-{k}")
        except Exception as e:
            print("ERR", k, e)
    for k, d in BG.items():
        try:
            await gen(k, d, BG_STYLE, f"fbgf-{k}")
        except Exception as e:
            print("ERR", k, e)


if __name__ == "__main__":
    asyncio.run(main())
