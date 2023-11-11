import { AppHeader } from "@/components/AppHeader";
import { Icons } from "@/components/Icons";
import { PowerCard } from "@/components/cards/PowerCard";
import { QuestCard } from "@/components/cards/QuestCard";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { useFetchQuestById } from "@/hooks/useFetchQuests";
import { Placeholder } from "@/components/Placeholder";
import { Card } from "@/components/cards/Card";
import { $Enums } from "@prisma/client";
import { useJubmojis } from "@/hooks/useJubmojis";
import {
  useGetTeamLeaderboard,
  useUpdateTeamLeaderboardMutation,
} from "@/hooks/useTeamLeaderboard";
import toast from "react-hot-toast";
import { TeamLeaderboard } from "@/components/ui/TeamLeaderboard";
import { ProvingState, cardPubKeys } from "jubmoji-api";
import { addNullifiedSigs, loadNullifiedSigs } from "@/lib/localStorage";
import { useFetchCollectedCards } from "@/hooks/useFetchCards";
import {
  cn,
  getQuestCollectionCardIndices,
  isPowerCompleted,
} from "@/lib/utils";
import ProofProgressBar from "@/components/ui/ProofProgressBar";
import { Prisma } from "@prisma/client";

const PagePlaceholder = () => {
  return (
    <div className="grid grid-cols-1 gap-4 py-4">
      <div className="py-3">
        <Placeholder.Base className="w-4 h-4" />
      </div>
      <Placeholder.Card size="md" />
      <Placeholder.Card size="xs" />
      <Placeholder.Card size="xl" />
      <Placeholder.Button />
    </div>
  );
};

export default function QuestDetailPage() {
  const router = useRouter();
  const { id: questId } = router.query;
  const { data: jubmojis } = useJubmojis();
  const { isLoading: isLoadingCollectedCards, data: collectedCards = [] } =
    useFetchCollectedCards();
  const { isLoading: isLoadingQuest, data: quest = null } = useFetchQuestById(
    questId as string
  );
  const updateTeamLeaderboardMutation = useUpdateTeamLeaderboardMutation();
  const {
    isLoading: isLoadingLeaderboard,
    data: scoreMapping = {},
    refetch: refetchLeaderboard,
  } = useGetTeamLeaderboard(questId as string);
  const [provingState, setProvingState] = useState<ProvingState>();

  const onUpdateProvingState = (provingState: ProvingState) => {
    setProvingState(provingState);
  };

  useEffect(() => {
    // refetch the leaderboard when the mutation is successful
    if (updateTeamLeaderboardMutation.isSuccess) {
      refetchLeaderboard();
    }
  }, [refetchLeaderboard, updateTeamLeaderboardMutation.isSuccess]);

  const onUpdateTeamLeaderboardScore = async () => {
    if (!quest) return;

    // User has no Jubmojis at all
    if (!jubmojis || jubmojis.length === 0) {
      return toast.error(
        "Please collect some Jubmojis to participate in this leaderboard!"
      );
    }

    // Quest has ended
    const currentTime = new Date();
    if (quest.endTime && currentTime > new Date(quest.endTime)) {
      return toast.error("Quest has ended!");
    }

    const teamCardIndices = quest.prerequisiteCards.map((card) => card.index);
    const collectionCardIndices = quest.collectionCards.map(
      (card) => card.index
    );

    // User has no team card Jubmojis
    const teamJubmojis = jubmojis.filter((jubmoji) =>
      teamCardIndices.includes(jubmoji.pubKeyIndex)
    );
    if (teamJubmojis.length === 0) {
      return toast.error(
        "You must collect a team card Jubmoji to participate in this leaderboard!"
      );
    }

    // User has no unnullified collection card Jubmojis
    const { quests: questNullifiedSigMap } = await loadNullifiedSigs();
    const nullifiedSigs = questNullifiedSigMap[quest.id] || [];
    const unnullifiedCollectionJubmojis = jubmojis.filter(
      (jubmoji) =>
        collectionCardIndices.includes(jubmoji.pubKeyIndex) &&
        !nullifiedSigs.includes(jubmoji.sig)
    );
    if (unnullifiedCollectionJubmojis.length === 0) {
      return toast.error(
        "All of your Jubmojis have already been submitted to the leaderboard!"
      );
    }

    // Proof Jubmojis consists of team card Jubmojis and unnullified collection card Jubmojis
    const proofJubmojis = [...teamJubmojis, ...unnullifiedCollectionJubmojis];

    await toast.promise(
      updateTeamLeaderboardMutation.mutateAsync({
        jubmojis: proofJubmojis,
        quest,
        onUpdateProvingState,
      }),
      {
        loading: "Updating team score...",
        success: (scoreAdded: any) => {
          // Add all used collection card signatures to nullified sigs
          const nullifiedSigs = unnullifiedCollectionJubmojis.map(
            (jubmoji) => jubmoji.sig
          );
          addNullifiedSigs({
            quests: {
              [quest.id]: nullifiedSigs,
            },
            powers: {},
          });
          setProvingState(undefined);

          return `Added ${scoreAdded} points to your team's score!`;
        },
        error: (err: any) => {
          setProvingState(undefined);
          return err.message;
        },
      }
    );
  };

  if (isLoadingQuest) return <PagePlaceholder />;
  if (!quest) return <div>Quest not found</div>;

  const showLeaderboard = quest.proofType === $Enums.ProofType.TEAM_LEADERBOARD;

  const collectionCardIndices = getQuestCollectionCardIndices(quest);

  const numPowersCompleted = jubmojis
    ? quest.powers.filter((power) => isPowerCompleted(power, jubmojis)).length
    : 0;

  const proofProgressPercentage = provingState
    ? (provingState.numProofsCompleted / (provingState.numProofsTotal || 1)) *
      100
    : 0;
  let proofProgressDisplayText = "";
  if (provingState) {
    switch (provingState.numProofsCompleted) {
      case 0:
        proofProgressDisplayText =
          "Proving ownership of a team card Jubmoji...";
        break;
      case provingState.numProofsTotal:
        proofProgressDisplayText = "Submitting proof to leaderboard...";
        break;
      default:
        proofProgressDisplayText = `Proving ownership of Jubmoji ${
          provingState.numProofsCompleted
        } of ${
          provingState.numProofsTotal - 1 // -1 because the team proof is already counted
        }...`;
    }
  }

  const endDateFormattedTime = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date(quest.endTime));
  const endDateLabel =
    new Date(quest.endTime) < new Date()
      ? `Ended on ${endDateFormattedTime}`
      : `Ends on ${endDateFormattedTime}`;

  return (
    <div>
      <AppHeader
        title={
          <Link href="/">
            <button>
              <Icons.arrowBack />
            </button>
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4">
        <QuestCard
          title={quest.name}
          description={quest.description}
          showProgress
          image={quest.imageLink || ""}
          spacing="sm"
          numPowersCompleted={numPowersCompleted}
          numPowersTotal={quest.powers.length}
        >
          <div className="flex flex-col gap-1 mt-2">
            {collectionCardIndices.length > 0 && (
              <>
                <div className="flex flex-col">
                  <Card.Title className="!text-base text-left">
                    Collect
                  </Card.Title>
                  <div className="flex gap-2"></div>
                </div>
                <div className="flex flex-wrap gap-1 mr-auto">
                  {collectionCardIndices.map((index) => {
                    const isCollected = collectedCards.find(
                      (collectedCard) => collectedCard.pubKeyIndex === index
                    )?.pubKeyIndex;

                    return isLoadingCollectedCards ? (
                      <Placeholder.Base className="w-4 h-4"></Placeholder.Base>
                    ) : (
                      <span
                        key={index}
                        className={cn(
                          "!text-[20px]",
                          !isCollected && "opacity-30"
                        )}
                      >
                        {quest.proofType ===
                          $Enums.ProofType.TEAM_LEADERBOARD &&
                        !jubmojis?.find(
                          (jubmoji) => jubmoji.pubKeyIndex === index
                        )
                          ? "❓" // Hide collection emojis that have not been collected for team leaderboard quests
                          : cardPubKeys[index].emoji}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            <div className="ml-auto">
              <span className="text-shark-400 text-[13px] font-dm-sans">
                {endDateLabel}
              </span>
            </div>
          </div>
        </QuestCard>

        {quest.powers.map((power) => {
          const collectionCardIndices = power.collectionCards.map(
            (card) => card.index
          );
          const collectedItems =
            jubmojis?.filter((jubmoji) =>
              collectionCardIndices.includes(jubmoji.pubKeyIndex)
            ).length ?? 0;

          const proofParams = power.proofParams as Prisma.JsonObject;
          let powerIsLocked: boolean;
          let numCardsCollected: number;
          let numCardsTotal: number;
          if (power.proofType === $Enums.ProofType.N_UNIQUE_IN_COLLECTION) {
            const N = proofParams.N as number;
            powerIsLocked = collectedItems < N;
            numCardsCollected = Math.min(collectedItems, N);
            numCardsTotal = N;
          } else {
            powerIsLocked = collectedItems === 0;
            numCardsCollected = Math.min(collectedItems, 1);
            numCardsTotal = 1;
          }

          return powerIsLocked === undefined || powerIsLocked ? (
            <PowerCard
              title={power.name}
              description={power.description}
              powerType={power.powerType}
              locked={powerIsLocked}
              disabled={powerIsLocked}
              numCardsCollected={numCardsCollected}
              numCardsTotal={numCardsTotal}
              showProgress
            />
          ) : (
            <Link key={power.id} href={`/powers/${power.id}`}>
              <PowerCard
                title={power.name}
                description={power.description}
                powerType={power.powerType}
                locked={powerIsLocked}
                disabled={powerIsLocked}
                numCardsCollected={numCardsCollected}
                numCardsTotal={numCardsTotal}
                showProgress
                shortDescription
                ellipsis
              />
            </Link>
          );
        })}

        {showLeaderboard && (
          <>
            <TeamLeaderboard
              items={scoreMapping}
              loading={isLoadingLeaderboard}
            />
            {provingState && (
              <ProofProgressBar
                displayText={proofProgressDisplayText}
                progressPercentage={proofProgressPercentage}
              />
            )}
            <Button
              variant="secondary"
              onClick={onUpdateTeamLeaderboardScore}
              disabled={provingState !== undefined}
              loading={provingState !== undefined}
            >
              Update team score
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
