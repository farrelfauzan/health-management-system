import type { ReactElement } from 'react';

import { joinClassNames } from '#lib/landing/join-class-names';
import type { MikoMood } from '#lib/landing/miko-mood';

type MikoMascotProps = {
  mood: MikoMood;
  /** Sizes the mascot; the drawing fills its box. */
  className?: string;
};

/**
 * Miko, the MetaKlinik mascot: a chat-bubble body with a plus antenna. Every part is
 * always drawn; the `m-<mood>` class decides which parts show and how they move.
 */
export function MikoMascot({ mood, className }: MikoMascotProps): ReactElement {
  return (
    <div className={joinClassNames(`m-${mood}`, className)}>
      <svg
        className="mk size-full"
        viewBox="0 0 240 240"
        role="img"
        aria-label="Miko, maskot MetaKlinik"
      >
        <ellipse className="mk-shadow" cx="120" cy="226" rx="46" ry="6" />
        <g className="mk-rings">
          <circle className="mk-ring" cx="120" cy="132" r="98" />
          <circle className="mk-ring r2" cx="120" cy="132" r="98" />
        </g>
        <g className="mk-float">
          <g className="mk-tilt">
            <g className="mk-squash">
              <g className="mk-arm-l">
                <rect
                  x="30"
                  y="126"
                  width="22"
                  height="34"
                  rx="11"
                  transform="rotate(24 41 143)"
                  fill="#1E63E9"
                />
              </g>
              <g className="mk-arm-r">
                <rect
                  x="188"
                  y="126"
                  width="22"
                  height="34"
                  rx="11"
                  transform="rotate(-24 199 143)"
                  fill="#16B3A3"
                />
              </g>
              <g className="mk-antenna">
                <path className="mk-stem" d="M120 64 V40" />
                <circle cx="120" cy="30" r="13" fill="#14B8A6" />
                <g className="mk-aplus">
                  <rect x="117.5" y="22" width="5" height="16" rx="2.5" fill="#FFFFFF" />
                  <rect x="112" y="27.5" width="16" height="5" rx="2.5" fill="#FFFFFF" />
                </g>
              </g>
              <path
                d="M120 58 C168 58 196 88 196 132 C196 176 166 202 120 202 C108 202 97 200 88 197 L64 210 C60 212 56 208 58 204 L66 186 C52 172 44 154 44 132 C44 88 72 58 120 58 Z"
                fill="url(#mkBody)"
              />
              <ellipse
                cx="90"
                cy="84"
                rx="22"
                ry="11"
                transform="rotate(-26 90 84)"
                fill="#FFFFFF"
                opacity=".22"
              />
              <ellipse cx="78" cy="152" rx="9" ry="5.5" fill="#FF9BB0" opacity=".65" />
              <ellipse cx="162" cy="152" rx="9" ry="5.5" fill="#FF9BB0" opacity=".65" />
              <g className="mk-eyes-open">
                <ellipse cx="98" cy="124" rx="14" ry="17" fill="#FFFFFF" />
                <ellipse cx="142" cy="124" rx="14" ry="17" fill="#FFFFFF" />
                <g className="mk-pupils">
                  <circle cx="100" cy="127" r="8" fill="#0B1C30" />
                  <circle cx="144" cy="127" r="8" fill="#0B1C30" />
                  <circle cx="103" cy="123" r="2.8" fill="#FFFFFF" />
                  <circle cx="147" cy="123" r="2.8" fill="#FFFFFF" />
                </g>
              </g>
              <g className="mk-eyes-happy">
                <path className="mk-line" d="M86 128 Q98 112 110 128" />
                <path className="mk-line" d="M130 128 Q142 112 154 128" />
              </g>
              <path className="mk-line mk-mouth-smile" d="M110 150 Q120 160 130 150" />
              <g className="mk-mouth-talk">
                <rect x="103" y="145" width="34" height="16" rx="8" fill="#0B1C30" />
                <rect className="mk-bar" x="109" y="149" width="3.5" height="8" rx="1.75" />
                <rect className="mk-bar b2" x="115.5" y="149" width="3.5" height="8" rx="1.75" />
                <rect className="mk-bar b3" x="122" y="149" width="3.5" height="8" rx="1.75" />
                <rect className="mk-bar b4" x="128.5" y="149" width="3.5" height="8" rx="1.75" />
              </g>
              <g className="mk-sparks">
                <g className="mk-spark">
                  <path className="mk-sparkline" stroke="#14B8A6" d="M40 58 V74 M32 66 H48" />
                </g>
                <g className="mk-spark s2">
                  <path className="mk-sparkline" stroke="#0066FF" d="M204 50 V62 M198 56 H210" />
                </g>
                <g className="mk-spark s3">
                  <path className="mk-sparkline" stroke="#0066FF" d="M24 110 V120 M19 115 H29" />
                </g>
                <g className="mk-spark s4">
                  <path className="mk-sparkline" stroke="#14B8A6" d="M218 104 V118 M211 111 H225" />
                </g>
              </g>
              <g className="mk-think">
                <circle className="mk-dot" cx="178" cy="62" r="5" />
                <circle className="mk-dot d2" cx="194" cy="46" r="7" />
                <circle className="mk-dot d3" cx="214" cy="28" r="9" />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
