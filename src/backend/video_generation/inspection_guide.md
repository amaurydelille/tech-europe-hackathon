## Visual inspection checklist

After every `gen_video` or `gen_image` call, open the generated frames (videos have `frame_paths` sampled at 2 fps; for a still, open the image directly). Be **extra critical** on these two axes — they are the most common failure modes:

1. **Does the action make sense cinematically?**
   - Is the camera move consistent with the prompt (steady push-in stays steady; pan keeps direction)?
   - Does the subject's motion match what was described (a marching legion should march, not stand still or moonwalk)?
   - Are continuity-breaking pops, jump-cuts, or sudden style shifts visible between frames?
   - Does the framing keep the subject readable (not cropped weirdly by the canvas)?

2. **Are bodies, costumes, or characters distorted?**
   - Extra or missing limbs, fused fingers, melted faces, asymmetric eyes.
   - Costumes morphing across frames (a red cloak becoming green; a helmet appearing/disappearing).
   - Background characters with malformed anatomy.
   - The anchored character no longer resembling the reference image.

If either check fails, **regenerate the asset** with a tightened prompt (more anatomical/staging detail, explicit instructions to fix the broken element) or a different reference. Do not paper over a bad shot by shortening its duration — it will still be visible.

For static stills, only the second axis applies; for animated stills (`animate_image`), neither typically fails because no generative motion is involved.
