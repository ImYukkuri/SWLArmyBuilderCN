# Legion symbols

Source: https://github.com/Owen-A/Legion-font
Pinned commit: 52a9d52f4f483044ddb04d0f26ed64171ae9e1c3
Font: Legionfont0.1.4.ttf (Owen-A, updates by lyerelian).
License: MIT; original notice in legion-icons-LICENSE.txt.

The inline SVG symbols in roster.html are outlines extracted from this font
using fontTools SVGPathPen. They require no remote fonts and remain available
in exported offline HTML. This is a community reproduction of Legion card
symbols, not an official asset pack.

Glyph mapping: commander=5, operative=b, corps=6, special forces=7,
support=8, heavy=9; hit=h, critical=c, block=s,
attack surge=a, defense surge=d.

Upgrade slot glyphs visually checked against local card symbols (2026-11-07):
personnel=U, gear=G, grenades=N, heavy weapon=W, force=F, comms=O,
pilot=P, hardpoint=H, command=C, training=M, generator=I, armament=B, crew=A.
V is not the Protocol slot symbol. Missing slot symbols use text labels.
See docs/SLOT_GLYPH_REVIEW.md for the visual review and missing-symbol list.

Distance symbols 0–4 use the corresponding digit glyphs. Other distance values
(including half distance) reuse the frame from glyph 1 with the value cut out
using an SVG text mask. Rule text, legacy Chinese icon markers and icon escape
tokens share this renderer; no external font request is needed, including offline.
