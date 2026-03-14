import React from "react";
import { PartChoiceCard } from "../../../components/game/PartChoiceCard";
import { LocationShowcase } from "../../../components/game/LocationShowcase";
import type { LocationCard } from "../../../game/locations";
import type { PlayerSlot } from "../../../types";
import { seatLabel } from "../gameUtils";
import { MysticPanel, MysticScene, mysticButtonClass, mysticInfoPillClass } from "../../../components/chrome/MysticUI";

type ChoosePartsPhaseProps = {
  isMobileLayout: boolean;
  location: LocationCard;
  locationImageUrl: string | null;
  selectedSeat: PlayerSlot;
  pickingSeat: PlayerSlot;
  canActForSelected: boolean;
  picksByValue: Record<string, PlayerSlot[]>;
  isHost: boolean;
  busy: boolean;
  canConfirmParts: boolean;
  onPickPart: (partId: string | null) => void;
  onConfirmParts: () => void;
};

export function ChoosePartsPhase({
  isMobileLayout,
  location,
  locationImageUrl,
  selectedSeat,
  pickingSeat,
  canActForSelected,
  picksByValue,
  isHost,
  busy,
  canConfirmParts,
  onPickPart,
  onConfirmParts,
}: ChoosePartsPhaseProps) {
  if (isMobileLayout) {
    return (
      <MysticScene background="Back1" className="h-full min-h-0 rounded-2xl">
        <div className="flex h-full min-h-0 flex-col p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <span className={mysticInfoPillClass}>Assign faculties</span>
              <span className={mysticInfoPillClass}>Seat {seatLabel(selectedSeat)}</span>
            </div>
            {isHost && (
              <button onClick={onConfirmParts} disabled={busy || !canConfirmParts} className={mysticButtonClass("primary")}>
                Confirm
              </button>
            )}
          </div>

          <MysticPanel className="mt-3 p-2" glow="#67e8f9">
            <LocationShowcase
              locationName={location.name}
              locationRule={location.rule}
              locationImageUrl={locationImageUrl}
              panelClassName="w-full"
              imageClassName="h-[170px] w-[116px] rounded-xl object-cover"
            />
          </MysticPanel>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              {[...location.compulsory, ...location.optional].map((part) => {
                const takenBy = picksByValue[part.id] ?? [];
                const selectedBySelf = takenBy.includes(pickingSeat);
                const takenByOthers = takenBy.some((seat) => seat !== pickingSeat);
                const disabled = busy || !canActForSelected || takenByOthers;
                return (
                  <PartChoiceCard
                    key={part.id}
                    part={part}
                    takenBy={takenBy}
                    selected={selectedBySelf}
                    unavailable={takenByOthers}
                    disabled={disabled}
                    compact
                    onPick={() => {
                      if (disabled) return;
                      onPickPart(selectedBySelf ? null : part.id);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </MysticScene>
    );
  }

  return (
    <MysticScene background="Back1" className="h-full min-h-0 rounded-2xl">
      <div className="grid h-full min-h-0 grid-cols-[minmax(260px,420px)_minmax(0,1fr)] gap-4 p-4">
        <MysticPanel className="min-h-0 overflow-visible p-3" glow="#67e8f9">
          <LocationShowcase
            locationName={location.name}
            locationRule={location.rule}
            locationImageUrl={locationImageUrl}
            panelClassName="w-[250px]"
            imageClassName="h-[250px] w-[172px] rounded-xl object-cover"
          />
        </MysticPanel>

        <MysticPanel className="flex min-h-0 flex-col p-5" glow="#f6c453">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-extrabold text-white">Assign faculties</div>
              <div className="mt-1 text-xs text-white/65">
                Selected seat: <span className="font-extrabold text-white">{seatLabel(selectedSeat)}</span> {canActForSelected ? "" : "(view-only)"}
              </div>
            </div>
            {isHost && (
              <button onClick={onConfirmParts} disabled={busy || !canConfirmParts} className={mysticButtonClass("primary")}>
                Confirm faculties
              </button>
            )}
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-visible pr-1">
            <div className="grid gap-3 lg:grid-cols-2">
              {[...location.compulsory, ...location.optional].map((part) => {
                const takenBy = picksByValue[part.id] ?? [];
                const selectedBySelf = takenBy.includes(pickingSeat);
                const takenByOthers = takenBy.some((seat) => seat !== pickingSeat);
                const disabled = busy || !canActForSelected || takenByOthers;
                return (
                  <PartChoiceCard
                    key={part.id}
                    part={part}
                    takenBy={takenBy}
                    selected={selectedBySelf}
                    unavailable={takenByOthers}
                    disabled={disabled}
                    onPick={() => {
                      if (disabled) return;
                      onPickPart(selectedBySelf ? null : part.id);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </MysticPanel>
      </div>
    </MysticScene>
  );
}
