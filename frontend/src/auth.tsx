/**
 * Sign-out is needed both in the sidebar shell and on individual pages (the
 * Command Centre header carries its own Sign out button). A context avoids
 * threading a callback through every route element.
 */

import { createContext, useContext } from "react";

export const AuthContext = createContext<{ signOut: () => void }>({
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);
