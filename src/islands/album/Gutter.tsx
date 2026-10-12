// The seam between the two pages of a spread. Purely visual: the spread's
// structure is already in the markup, so assistive technology skips it.
export function Gutter() {
  return <div class="gutter" aria-hidden="true" />;
}
