import { CritiqueRoom } from "@/src/components/CritiqueRoom";

export default function PRRoom() {
  return (
    <CritiqueRoom
      cfg={{
        room: "pr",
        eyebrow: "▚ THE PLATFORM //",
        title: "PR ROOM",
        helper: "Drop a personal record — video or photo. Coach breaks down the lift and members hype & critique.",
        accent: "#FF7A18",
        coachName: "Coach",
        ctaLabel: "POST PR",
      }}
    />
  );
}
