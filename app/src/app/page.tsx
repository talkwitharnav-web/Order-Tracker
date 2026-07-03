import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <main className="container mx-auto p-4 md:p-8 text-center">
        <div className="bg-white p-12 rounded-xl shadow-lg max-w-2xl mx-auto">
          <h1 className="text-5xl font-bold text-slate-800 mb-4">
            Restaurant Order Tracker
          </h1>
          <p className="text-xl text-slate-600 mb-12">
            A simple, modern solution for kitchens and customers.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Link href="/restaurant" className="block p-8 bg-amber-500 text-white rounded-xl shadow-lg hover:bg-amber-600 transition-transform transform hover:scale-105">
              
                <h2 className="text-3xl font-bold mb-2">Kitchen View</h2>
                <p>Manage incoming orders.</p>
              
            </Link>
            <Link href="/customer" className="block p-8 bg-emerald-500 text-white rounded-xl shadow-lg hover:bg-emerald-600 transition-transform transform hover:scale-105">
              
                <h2 className="text-3xl font-bold mb-2">Customer View</h2>
                <p>Track your order status.</p>
              
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
