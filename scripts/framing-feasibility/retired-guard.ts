if (process.env.ALLOW_RETIRED_M34_RESEARCH !== "1") {
  console.error(
    "M34 automated certification research was retired by D-099. " +
      "Set ALLOW_RETIRED_M34_RESEARCH=1 only for an explicitly approved historical reproduction.",
  );
  process.exit(2);
}
