# Report runtime resources

ResultReportRenderer uses Apache FOP 2.12 with complex-script shaping/bidirectional
layout enabled and bundled ReportSans (DejaVu Sans regular/bold) embedded into PDFs.
PDFBox 3.0.8 is a test-only PDF parser/renderer. Existing dependency versions are
unchanged. Sources: https://xmlgraphics.apache.org/fop/2.12/embedding.html and
https://xmlgraphics.apache.org/fop/2.12/complexscripts.html.

Arabic shaping compatibility: these pinned fonts share the Arabic default GSUB
language-system offset with KUR. FOP's reader exposes the named alias and omits
the dflt alias for that shared offset. Arabic blocks explicitly select arab/KUR,
the exact default table, rather than alternate Urdu/Sindhi feature sets. This is
an OpenType table selector, not a claim about the natural language of content.
Regular/bold lam-alef glyph tests and visual mixed Arabic/English report review
protect against disconnected letters that Unicode-extraction-only tests miss.

Font files and the accompanying complete license are copied without modification
from the pinned official Matplotlib v3.10.7 source tree:
https://github.com/matplotlib/matplotlib/tree/v3.10.7/lib/matplotlib/mpl-data/fonts/ttf.
License: fonts/LICENSE_DEJAVU. Font family information:
https://dejavu-fonts.github.io/. These fonts supply glyphs, not laboratory branding.

SHA-256:
- DejaVuSans.ttf: 3fdf69cabf06049ea70a00b5919340e2ce1e6d02b0cc3c4b44fb6801bd1e0d22
- DejaVuSans-Bold.ttf: b184b89e3c1075f22f6b71575b6fc20d4972b3cfd3b23322ca6fd596dcaef167
- LICENSE_DEJAVU: d75938dec098f06f0ac3c00853065d94f020be1c3c62ef1dc2975ba15b4d9b0e

Optional deployment-owner inputs:
SMARTLIMS_REPORT_LABORATORY_IDENTITY supplies the exact laboratory display name.
SMARTLIMS_REPORT_LOGO_PATH is a file: or classpath: PNG/JPEG image, at most 2 MiB
and 4096 pixels per dimension; it is normalized to PNG. Empty configuration omits
identity/logo. No default laboratory identity, invented credential/signature or
digital signature. Text/clinical input cannot select resource paths.

The FOP resolver allows only bundled font bytes and supplied normalized logo bytes;
no external URI or arbitrary filesystem fetching during rendering. XML text is
escaped, external DTD/stylesheets are disabled, and diagnostics do not log patient
payloads. Font/layout failures yield REPORT_UNAVAILABLE rather than a partial report.
