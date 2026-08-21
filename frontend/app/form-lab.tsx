import { CritiqueRoom } from "@/src/components/CritiqueRoom";

export default function FormLab() {
  return (
    <CritiqueRoom
      cfg={{
        room: "form",
        eyebrow: "▚ THE LAB //",
        title: "FORM LAB",
        helper: "Post a lift for a technique check — video or photo. Coach and members break down your form and fixes.",
        accent: "#0A84FF",
        coachName: "Coach",
        ctaLabel: "POST FORM CHECK",
      }}
    />
  );
}
