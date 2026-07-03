'use client';

import { useState, useEffect, FormEvent } from 'react';

type Order = {
  id: number;
  restaurant_name: string;
  order_number: string;
  status: 'Received' | 'Preparing' | 'Complete';
};

const statusColors = {
  Received: 'bg-slate-50 text-slate-800 border border-slate-200',
  Preparing: 'bg-amber-50 text-amber-800 border border-amber-200',
  Complete: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
};

export default function RestaurantPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurantName, setRestaurantName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const fetchOrders = async () => {
    if (!restaurantName.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/orders/restaurant/${restaurantName}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setFormError('Order number cannot be blank.');
      return;
    }
    setFormError(''); // Clear error on successful submission
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_name: restaurantName, order_number: orderNumber }),
      });
      if (!response.ok) {
        throw new Error('Failed to create order');
      }
      setOrderNumber('');
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  const handleUpdateStatus = async (id: number, status: Order['status']) => {
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error('Failed to update status');
      }
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  useEffect(() => {
    if (restaurantName.trim()) {
      const timer = setTimeout(() => {
        fetchOrders();
      }, 500); // Debounce fetching
      return () => clearTimeout(timer);
    } else {
      setOrders([]);
    }
  }, [restaurantName]);
  
  // Polling for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      if(restaurantName.trim()) fetchOrders();
    }, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [restaurantName]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <main className="container mx-auto p-4 md:p-8">
        <h1 className="text-4xl font-bold text-slate-800 mb-8">Kitchen Dashboard</h1>

        <div className="mb-12">
            <label htmlFor="restaurantName" className="block text-lg font-medium text-slate-700 mb-2">
                Restaurant Name
            </label>
            <input
            id="restaurantName"
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="e.g., 'The Golden Spoon'"
            className="w-full max-w-md p-4 text-lg border-slate-200 rounded-xl shadow-sm focus:ring-amber-500 focus:border-amber-500"
            />
        </div>

        {restaurantName.trim() && (
            <>
        <div className="bg-white p-10 rounded-xl shadow-lg mb-12">
          <h2 className="text-2xl font-semibold text-slate-800 mb-6">Create New Order</h2>
          <form onSubmit={handleCreateOrder} className="flex flex-col md:flex-row items-start md:items-end gap-4">
            <div className="w-full">
              <label htmlFor="orderNumber" className="block text-lg font-medium text-slate-700 mb-2">
                Order Number
              </label>
              <input
                id="orderNumber"
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g., 'ORD-12345'"
                className={`w-full p-4 text-lg border rounded-xl shadow-sm focus:ring-amber-500 focus:border-amber-500 ${formError ? 'border-red-500' : 'border-slate-200'}`}
              />
              {formError && <p className="text-red-600 text-sm mt-2">{formError}</p>}
            </div>
            <button
              type="submit"
              disabled={!orderNumber.trim()}
              className="w-full md:w-auto px-8 py-4 text-lg font-semibold text-white bg-amber-600 rounded-xl shadow-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all duration-200 transform hover:scale-[1.02] disabled:bg-slate-400 disabled:cursor-not-allowed disabled:scale-100"
            >
              Add Order
            </button>
          </form>
        </div>

        <div className="bg-white p-10 rounded-xl shadow-lg leading-relaxed">
          <h2 className="text-2xl font-semibold text-slate-800 mb-6">Active Orders</h2>
          {isLoading && <p>Loading orders...</p>}
          {error && <p className="text-red-500">{error}</p>}
          <div className="space-y-6">
            {orders.length > 0 ? (
              orders.map((order) => (
                <div key={order.id} className="p-6 border border-slate-100 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="font-bold text-xl text-slate-800">#{order.order_number}</p>
                    <span
                      className={`px-3 py-1 mt-2 inline-block text-sm font-semibold rounded-full ${
                        statusColors[order.status]
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {(['Received', 'Preparing', 'Complete'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleUpdateStatus(order.id, status)}
                        disabled={order.status === status}
                        className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 transform hover:scale-[1.02] ${
                          order.status === status
                            ? 'text-white bg-slate-400 cursor-not-allowed'
                            : 'text-slate-700 bg-slate-100 hover:bg-slate-200 focus:ring-slate-300'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No active orders for this restaurant.</p>
            )}
          </div>
        </div>
        </>
        )}
      </main>
    </div>
  );
}
