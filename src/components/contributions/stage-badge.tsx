import { Badge, type BadgeTone } from "@/components/ui/badge";
import { stageDescriptions, stageLabels, type ContributionStage } from "@/lib/contributions";

type Stage = ContributionStage | "detected" | "claimable";

/** Stage colors from the design brief. */
const tones: Record<Stage, BadgeTone> = {
  detected: "fog",
  submitted: "fog",
  verified: "neutral",
  accepted: "sky",
  approved: "lavender",
  claimable: "lavender",
  paid: "ink",
  rejected: "cream",
};

export function stageTone(stage: Stage): BadgeTone {
  return tones[stage];
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge tone={tones[stage]} title={stageDescriptions[stage]}>
      {stageLabels[stage]}
    </Badge>
  );
}
