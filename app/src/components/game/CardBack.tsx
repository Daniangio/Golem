import React from "react";

export function CardBack({
  className = "h-[120px] w-[80px]",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-950 shadow-xl ring-1 ring-white/10 ${className}`}>
      <img
        src="/images/utils/card_back.png"
        alt="Card back"
        className="h-full w-full object-cover"
        draggable={false}
      />
      {children}
    </div>
  );
}
