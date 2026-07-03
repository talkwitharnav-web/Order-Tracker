'use client';

import { useState, FormEvent, useEffect } from 'react';

type OrderStatus = 'Received' | 'Preparing' | 'Complete';

type Order = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: OrderStatus;
};

const statusDetails = {
  Received: {
    badge: 'bg-slate-50 text-slate-800 border border-slate-200',
    message: 'Your order has been received by the kitchen.',
  },
  Preparing: {
    badge: 'bg-amber-50 text-amber-800 border border-amber-200',
    message: 'The chefs are busy preparing your order.',
  },
  Complete: {
    badge: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    message: 'Your order is complete and ready for pickup!',
  },
};

export default function CustomerPage() {
  const [restaurantName, setRestaurantName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderStatus = async (restName: string, ordNum: string) => {
    try {
      const query = new URLSearchParams({ restaurant_name: restName, order_number: ordNum });
      const response = await fetch(`/api/orders?${query}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to track order');
      }
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setOrder(null); // Clear order on error
    }
  };

  const handleTrackOrder = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setOrder(null);
    await fetchOrderStatus(restaurantName, orderNumber);
    setIsLoading(false);
  };
  
  useEffect(() => {
    if (!order) return;

    // If order is complete, no need to poll
    if (order.status === 'Complete') return;

    const interval = setInterval(() => {
      fetchOrderStatus(order.restaurant_name, order.order_number);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval); // Cleanup on component unmount or when order changes
  }, [order]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
      <main className="w-full max-w-md mx-auto p-4 md:p-8">
        <div className="bg-white p-10 rounded-xl shadow-lg leading-relaxed">
          <h1 className="text-3xl font-bold text-slate-800 mb-6 text-center">Track Your Order</h1>
          <form onSubmit={handleTrackOrder} className="space-y-6">
            <div>
              <label htmlFor="restaurantName" className="block text-lg font-medium text-slate-700 mb-2">
                Restaurant Name
              </label>
              <input
                id="restaurantName"
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder="e.g., 'The Golden Spoon'"
                className="w-full p-4 text-lg border-slate-200 rounded-xl shadow-sm focus:ring-amber-500 focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label htmlFor="orderNumber" className="block text-lg font-medium text-slate-700 mb-2">
                Order Number
              </label>
              <input
                id="orderNumber"
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g., 'ORD-12345'"
                className="w-full p-4 text-lg border-slate-200 rounded-xl shadow-sm focus:ring-amber-500 focus:border-amber-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-8 py-4 text-lg font-semibold text-white bg-amber-600 rounded-xl shadow-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:bg-slate-400 transition-all duration-200 transform hover:scale-[1.02]"
            >
              {isLoading ? 'Tracking...' : 'Track Order'}
            </button>
          </form>
        </div>

        {error && (
          <div className="mt-8 bg-red-100 p-6 rounded-xl shadow-lg">
            <p className="font-semibold text-red-700 text-center">{error}</p>
          </div>
        )}

        {order && (
          <div className="mt-8 bg-white p-10 rounded-xl shadow-lg leading-relaxed text-center">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Order Status</h2>
            <span className={`px-4 py-2 text-lg font-semibold rounded-full ${statusDetails[order.status].badge}`}>
                {order.status}
            </span>
            <p className="mt-4 text-slate-600">{statusDetails[order.status].message}</p>
          </div>
        )}
      </main>
    </div>
  );
}
