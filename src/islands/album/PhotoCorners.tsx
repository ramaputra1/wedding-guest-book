// Four gummed photo corners. On an empty mount they are all there is:
// the bare corners are the invitation, so no instruction text is needed.
export function PhotoCorners() {
  return (
    <>
      <span class="corner corner--top-start" aria-hidden="true" />
      <span class="corner corner--top-end" aria-hidden="true" />
      <span class="corner corner--bottom-start" aria-hidden="true" />
      <span class="corner corner--bottom-end" aria-hidden="true" />
    </>
  );
}
