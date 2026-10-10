import { Badge, type BadgeTone } from "@/components/ui/badge";
import { stageDescriptions, stageLabels, type ContributionStage } from "@/lib/contributions";

type Stage = ContributionStage | "detected" | "claimable";

const tones: Record<Stage, BadgeTone> = {
  detected: "neutral",
  submitted: "neutral",
  verified: "accent",
  accepted: "warning",
  approved: "success",
  claimable: "success",
  paid: "neutral",
  rejected: "danger",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge tone={tones[stage]} title={stageDescriptions[stage]}>
      {stageLabels[stage]}
    </Badge>
  );
}
