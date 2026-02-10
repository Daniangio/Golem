import React from "react";

export function SphereLocationImages({
  sphere,
  sphereImageUrl,
  locationName,
  locationImageUrl,
  orientation = "row",
  className,
}: {
  sphere: number;
  sphereImageUrl: string | null;
  locationName: string;
  locationImageUrl: string | null;
  orientation?: "row" | "column";
  className?: string;
}) {
  const direction = orientation === "column" ? "flex-col" : "flex-row";
  return (
    <div className={`flex h-full min-h-0 ${direction} gap-1 p-1 ${className ?? ""}`}>
      <div className="min-h-0 min-w-0 flex-1">
        {sphereImageUrl ? (
          <img
            src={sphereImageUrl}
            alt={`Sphere ${sphere}`}
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/60">Sphere art missing</div>
        )}
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        {locationImageUrl ? (
          <img
            src={locationImageUrl}
            alt={locationName}
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center">
            <div>
              <div className="text-xs font-semibold text-white/60">Location art missing</div>
              <div className="mt-2 text-sm font-extrabold text-white">{locationName}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
