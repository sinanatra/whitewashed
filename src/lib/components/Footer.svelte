<script>
  const encodedEmail = "Y2lhb0BnaWFjb21vLndlYnNpdGU=";

  function decodeBase64(value) {
    if (typeof atob === "function") {
      return atob(value);
    }

    return Buffer.from(value, "base64").toString("utf8");
  }

  const submissionEmail = decodeBase64(encodedEmail);
</script>

<footer class="border-t border-black bg-black px-4 py-6 text-white sm:px-6 lg:px-6 min-h-60">
  <div class="mx-auto flex max-w-[1800px] flex-col gap-2 text-sm text-white/80 sm:flex-row sm:items-center sm:justify-between">
    <p><span class="marker-text">Have an image to add to the archive?</span></p>
    <a
      href={`mailto:${submissionEmail}`}
      class="text-white underline underline-offset-4"
    >
      <span class="marker-text">Submit at {submissionEmail}</span>
    </a>
  </div>
</footer>
