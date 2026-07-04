import { getDb } from "@/lib/db";
import Link from "next/link";

export default async function AdminDbPage() {
  const db = await getDb();
  const restaurants = await db.all("SELECT * FROM restaurants");
  const orders = await db.all("SELECT * FROM orders");

  return (
    <div className="bg-black text-white min-h-screen p-8 font-mono">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-red-500">
          DATABASE VIEWER
        </h1>
        <Link
          href="/"
          className="bg-gray-800 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
        >
          Back to Home
        </Link>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">
          Restaurants
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-gray-900 border border-gray-700">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b border-gray-700">ID</th>
                <th className="py-2 px-4 border-b border-gray-700">Name</th>
                <th className="py-2 px-4 border-b border-gray-700">
                  Hashed Password
                </th>
                <th className="py-2 px-4 border-b border-gray-700">
                  Raw Password
                </th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r: any) => (
                <tr key={r.id}>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {r.id}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {r.name}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800 break-all">
                    {r.password}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {r.raw_password}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">
          Orders
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-gray-900 border border-gray-700">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b border-gray-700">ID</th>
                <th className="py-2 px-4 border-b border-gray-700">
                  Restaurant Name
                </th>
                <th className="py-2 px-4 border-b border-gray-700">
                  Order Number
                </th>
                <th className="py-2 px-4 border-b border-gray-700">Status</th>
                <th className="py-2 px-4 border-b border-gray-700">
                  Created At
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {o.id}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {o.restaurant_name}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {o.order_number}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {o.status}
                  </td>
                  <td className="py-2 px-4 border-b border-gray-800">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
