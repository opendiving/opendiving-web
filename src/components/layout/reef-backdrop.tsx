// The landing hero's backdrop: an original reef, drawn for this project in
// the idiom of the licensed drawing it replaced - a branching coral, a cluster
// of tube sponges, a fish, a sandy bottom - as clean outlines in the same
// stroke as the brand mark, with the mark's three bubbles rising off the reef.
// Nothing here is third-party; NOTICE.md names it beside the mark for that
// reason. See "The brand mark is original now, and marketplace artwork cannot
// ship here" in DECISIONS.md for why the reef went and what this one is made of.
//
// The outlines are hollow by knockout, not by geometry: each coral lobe is one
// centreline painted twice, in teal at its width plus two strokes and then in
// the page background at its width, so the lobes merge into a single outlined
// tree. The sponges, the fish and its tail are filled with the same background
// for the same reason, painted back to front. That colour has to be the page
// background token - anything else shows as a patch in the other theme - and
// the opacity has to sit on the <svg>, where the erasures composite at full
// strength before the whole drawing is faded.
import type { CSSProperties } from "react";

const bgFill: CSSProperties = { fill: "hsl(var(--background))" };
const bgStroke: CSSProperties = { stroke: "hsl(var(--background))" };

export function ReefBackdrop({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* branching coral: outline pass, then the interior knocked out */}
      <path
        d="M55 181C56 172 56 162 55 152"
        strokeWidth="19"
        strokeLinecap="butt"
      />
      <path
        d="M55 152C50 138 40 122 36 100C34 90 33 82 34 74"
        strokeWidth="16"
      />
      <path
        d="M55 152C62 138 74 126 80 106C83 96 84 88 84 80"
        strokeWidth="16"
      />
      <path
        d="M56 168C46 164 34 158 24 148C20 142 17 138 16 132"
        strokeWidth="15"
      />
      <path
        d="M57 168C66 164 78 160 88 152C94 146 98 142 100 136"
        strokeWidth="15"
      />
      <path
        d="M42 118C46 110 52 102 56 90C58 84 58 78 58 72"
        strokeWidth="14"
      />
      <path
        d="M76 116C82 110 90 106 96 98C99 94 100 90 100 86"
        strokeWidth="14"
      />
      <path
        d="M40 124C32 120 26 112 22 102C20 98 19 94 19 90"
        strokeWidth="13"
      />
      <g style={bgStroke}>
        <path
          d="M55 181C56 172 56 162 55 152"
          strokeWidth="13"
          strokeLinecap="butt"
        />
        <path
          d="M55 152C50 138 40 122 36 100C34 90 33 82 34 74"
          strokeWidth="10"
        />
        <path
          d="M55 152C62 138 74 126 80 106C83 96 84 88 84 80"
          strokeWidth="10"
        />
        <path
          d="M56 168C46 164 34 158 24 148C20 142 17 138 16 132"
          strokeWidth="9"
        />
        <path
          d="M57 168C66 164 78 160 88 152C94 146 98 142 100 136"
          strokeWidth="9"
        />
        <path
          d="M42 118C46 110 52 102 56 90C58 84 58 78 58 72"
          strokeWidth="8"
        />
        <path
          d="M76 116C82 110 90 106 96 98C99 94 100 90 100 86"
          strokeWidth="8"
        />
        <path
          d="M40 124C32 120 26 112 22 102C20 98 19 94 19 90"
          strokeWidth="7"
        />
      </g>
      {/* sand, painted over the coral's foot */}
      <path d="M8 190C50 178 100 176 150 182" />
      <path d="M86 194C136 186 190 184 234 178" />
      {/* sea grass between the coral and the sponges */}
      <path d="M100 188C98 178 100 170 106 162" />
      <path d="M106 188C108 178 110 172 116 166" />
      <path d="M95 189C93 182 93 176 90 170" />
      {/* tube sponges, back to front */}
      <path
        d="M146 112C146 145.3 152.6 171.2 152.6 186L163.4 186C163.4 171.2 162 145.3 162 112A8 3.4 0 0 1 146 112Z"
        style={bgFill}
      />
      <ellipse cx="154" cy="112" rx="8.6" ry="3.7" style={bgFill} />
      <ellipse cx="154" cy="112.7" rx="4.6" ry="1.7" />
      <path
        d="M179.5 138C179.5 159.6 178.6 176.4 178.6 186L187.4 186C187.4 176.4 192.5 159.6 192.5 138A6.5 2.7 0 0 1 179.5 138Z"
        style={bgFill}
      />
      <ellipse cx="186" cy="138" rx="7" ry="3" style={bgFill} />
      <ellipse cx="186" cy="138.5" rx="3.8" ry="1.4" />
      <path
        d="M127 132C127 156.3 127.9 175.2 127.9 186L140.1 186C140.1 175.2 145 156.3 145 132A9 3.8 0 0 1 127 132Z"
        style={bgFill}
      />
      <ellipse cx="136" cy="132" rx="9.7" ry="4.2" style={bgFill} />
      <ellipse cx="136" cy="132.8" rx="5.2" ry="1.9" />
      <path
        d="M163 152C163 167.3 168.2 179.2 168.2 186L177.8 186C177.8 179.2 177 167.3 177 152A7 2.9 0 0 1 163 152Z"
        style={bgFill}
      />
      <ellipse cx="170" cy="152" rx="7.6" ry="3.2" style={bgFill} />
      <ellipse cx="170" cy="152.6" rx="4.1" ry="1.4" />
      <path
        d="M114 158C114 170.6 117.9 180.4 117.9 186L126.1 186C126.1 180.4 126 170.6 126 158A6 2.5 0 0 1 114 158Z"
        style={bgFill}
      />
      <ellipse cx="120" cy="158" rx="6.5" ry="2.8" style={bgFill} />
      <ellipse cx="120" cy="158.5" rx="3.5" ry="1.3" />
      {/* anemone under the fish */}
      <path d="M205 180C203 174 200 170 197 167" />
      <path d="M208 178C208 172 207 167 205 163" />
      <path d="M212 177C213 171 214 166 215 162" />
      <path d="M216 178C219 173 221 169 224 166" />
      <path d="M219 181C223 178 227 176 231 175" />
      <path d="M203 186C203 179 221 179 221 186" style={bgFill} />
      {/* fish, swimming left: fins first, so the body covers their roots */}
      <path d="M188 50C194 40 206 39 212 52" />
      <path d="M196 70C200 76 206 76 210 69" />
      <path
        d="M215 58C221 54 225 50 229 48C226 54 226 62 229 68C225 66 221 62 215 58Z"
        style={bgFill}
      />
      <path
        d="M176 60C176 52 186 47 198 47C206 47 212 52 216 58C212 66 206 72 198 72C186 72 176 68 176 60Z"
        style={bgFill}
      />
      <path d="M188 51C191 56 191 63 188 68" />
      <path d="M192 61C196 64 200 64 202 61" />
      <circle cx="182" cy="57.5" r="1.8" fill="currentColor" stroke="none" />
      {/* the mark: three bubbles rising off the reef */}
      <circle cx="30" cy="54" r="2.2" />
      <circle cx="38" cy="41" r="3.4" />
      <circle cx="49" cy="26" r="4.6" />
    </svg>
  );
}
