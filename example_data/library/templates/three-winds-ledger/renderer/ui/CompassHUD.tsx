import { motion, useAnimationControls } from "motion/react";
import { useEffect } from "react";
import type { WindBalance, WindKey } from "../data/types";
import { WIND_ANGLE, WIND_COLOR, WIND_LABEL, WIND_SUBLABEL } from "../data/wind";

interface CompassHUDProps {
  balance: WindBalance;
}

export function CompassHUD({ balance }: CompassHUDProps) {
  const dominant = balance.dominant;
  return (
    <div className="tw-compass">
      <svg viewBox="-50 -50 100 100" className="tw-compass-svg">
        <defs>
          <radialGradient id="tw-compass-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1208" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0a0604" stopOpacity="0.7" />
          </radialGradient>
        </defs>
        <circle r="44" fill="url(#tw-compass-grad)" stroke="#b6822a" strokeWidth="0.6" opacity="0.85" />
        <circle r="36" fill="none" stroke="#b6822a" strokeWidth="0.3" opacity="0.4" />
        <circle r="3" fill="#b6822a" />

        {/* tick marks every 30deg */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = i * 30;
          const long = i % 3 === 0;
          const inner = long ? 30 : 34;
          const outer = 38;
          const a = (angle - 90) * (Math.PI / 180);
          return (
            <line
              key={i}
              x1={Math.cos(a) * inner}
              y1={Math.sin(a) * inner}
              x2={Math.cos(a) * outer}
              y2={Math.sin(a) * outer}
              stroke="#b6822a"
              strokeWidth={long ? 0.6 : 0.3}
              opacity={long ? 0.7 : 0.35}
            />
          );
        })}

        {/* three wind arrows */}
        {(["north", "east", "south"] as WindKey[]).map((wind) => (
          <WindArrow
            key={wind}
            wind={wind}
            weight={balance[wind]}
            isDominant={dominant === wind}
          />
        ))}

        {/* labels */}
        {(["north", "east", "south"] as WindKey[]).map((wind) => {
          const angle = ((WIND_ANGLE[wind] - 90) * Math.PI) / 180;
          const r = 46;
          return (
            <text
              key={wind}
              x={Math.cos(angle) * r}
              y={Math.sin(angle) * r}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="6"
              fill={WIND_COLOR[wind]}
              opacity={dominant === wind ? 1 : 0.55}
              fontWeight={dominant === wind ? 700 : 400}
            >
              {WIND_LABEL[wind]}
            </text>
          );
        })}
      </svg>
      <div className="tw-compass-readout">
        <div className="tw-compass-readout-wind" style={{ color: WIND_COLOR[dominant] }}>
          {WIND_LABEL[dominant]}
        </div>
        <div className="tw-compass-readout-sub">{WIND_SUBLABEL[dominant]}</div>
      </div>
    </div>
  );
}

interface WindArrowProps {
  wind: WindKey;
  weight: number;
  isDominant: boolean;
}

function WindArrow({ wind, weight, isDominant }: WindArrowProps) {
  const baseAngle = WIND_ANGLE[wind];
  const controls = useAnimationControls();
  const length = 14 + weight * 22;

  useEffect(() => {
    controls.start({
      rotate: baseAngle,
      transition: {
        type: "spring",
        stiffness: isDominant ? 60 : 30,
        damping: 8,
      },
    });
  }, [controls, baseAngle, isDominant]);

  return (
    <motion.g
      animate={controls}
      initial={{ rotate: baseAngle - 30 }}
      style={{ transformOrigin: "0px 0px", transformBox: "fill-box" } as never}
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-length}
        stroke={WIND_COLOR[wind]}
        strokeWidth={isDominant ? 1.4 : 0.8}
        strokeLinecap="round"
        opacity={isDominant ? 0.95 : 0.5}
      />
      <polygon
        points={`0,${-length - 3} -2.5,${-length + 2} 2.5,${-length + 2}`}
        fill={WIND_COLOR[wind]}
        opacity={isDominant ? 1 : 0.6}
      />
    </motion.g>
  );
}
