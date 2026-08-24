import { useEffect } from "react";

import { supabase } from "../lib/supabase/client";

interface Props {
  contentId: string;
}

export default function AuthGuard({ contentId }: Props) {
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          window.location.assign("/login");
          return;
        }

        document.getElementById(contentId)?.removeAttribute("hidden");
      } catch {
        if (mounted) window.location.assign("/login");
      }
    };

    void checkSession();

    return () => {
      mounted = false;
    };
  }, [contentId]);

  return null;
}
