import { redirect } from "next/navigation";

/** Customer master removed — type customer name on each order instead. */
export default function CustomersPage() {
  redirect("/orders");
}
