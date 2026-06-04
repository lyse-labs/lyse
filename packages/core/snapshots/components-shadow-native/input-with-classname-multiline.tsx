import { Button } from "@acme/ui";
import React from "react";

export function Nav() {
  return (
    <nav>
      <button
        className="nav-item"
        onClick={handleClick}
      >
        Home
      </button>
    </nav>
  );
}
