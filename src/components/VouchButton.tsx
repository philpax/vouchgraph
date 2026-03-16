import { useState } from "react";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { Auth } from "../hooks/useAuth";
import { createVouch, deleteVouch } from "../lib/vouch-actions";
import { VouchConfirmModal } from "./VouchConfirmModal";
import { Button } from "./ui";

export function VouchButton({
  auth,
  profile,
  vouchDetails,
  queueAutoRebuild,
}: {
  auth: Auth;
  profile: AppBskyActorDefs.ProfileViewDetailed;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  queueAutoRebuild: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [unvouching, setUnvouching] = useState(false);

  if (!auth.agent || !auth.did || auth.did === profile.did) return null;

  const myVouches = vouchDetails.get(auth.did);
  const isVouching = myVouches?.outbound.includes(profile.did) ?? false;

  const handleVouch = async () => {
    await createVouch(auth.agent!, profile.did);
    queueAutoRebuild();
    setShowModal(false);
  };

  const handleUnvouch = async () => {
    setUnvouching(true);
    try {
      await deleteVouch(auth.agent!, profile.did);
      queueAutoRebuild();
    } catch {
      // ignore
    } finally {
      setUnvouching(false);
    }
  };

  return (
    <>
      {isVouching ? (
        <Button
          variant="danger"
          onClick={handleUnvouch}
          disabled={unvouching}
          fullWidth
          className="mt-2"
        >
          {unvouching ? "Unvouching..." : "Unvouch"}
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => setShowModal(true)}
          fullWidth
          className="mt-2"
        >
          Vouch
        </Button>
      )}
      {showModal && (
        <VouchConfirmModal
          profile={profile}
          onConfirm={handleVouch}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
}
