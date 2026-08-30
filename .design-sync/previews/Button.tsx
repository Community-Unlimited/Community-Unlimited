import { Button } from "frontend";

/**
 * Slide 25 of the brand guide: "orange signals every primary action".
 * `primary` is the accessible orange (#A83C17); `secondary` is the interactive
 * teal. The raw brand teal #3CBFB8 is never a button fill — it is 2.25:1 on
 * white and cannot carry white text.
 */
export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary">Register</Button>
    <Button variant="secondary">Approve CB4</Button>
    <Button variant="ghost">Manage</Button>
    <Button variant="danger">Cancel session</Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" disabled>
      Sending…
    </Button>
    <Button variant="secondary" disabled>
      Approve CB4
    </Button>
    <Button variant="ghost" disabled>
      Manage
    </Button>
  </div>
);

export const FullWidth = () => (
  <div className="max-w-sm">
    <Button variant="primary" className="w-full">
      Register
    </Button>
  </div>
);
