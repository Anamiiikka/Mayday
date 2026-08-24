import { redirect } from "next/navigation";

// The Command Room now lives on the landing page; keep old links working.
export default function CommandRoomRedirect() {
  redirect("/#command-room");
}
