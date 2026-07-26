import React, { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CartFilter = () => {
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sample data for demo
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    items: [
      { category: 'Meat', amount: 0 },
      { category: 'Vegetables', amount: 0 },
      { category: 'Dairy', amount: 0 },
      { category: 'Grains', amount: 0 },
      { category: 'Other', amount: 0 }
    ]
  });

  // Calculate spending by category
  const calculateCategorySpending = () => {
    const spending = {};
    receipts.forEach(receipt => {
      receipt.items.forEach(item => {
        spending[item.category] = (spending[item.category] || 0) + item.amount;
      });
    });
    return Object.entries(spending).map(([category, amount]) => ({
      name: category,
      value: parseFloat(amount.toFixed(2))
    }));
  };

  // Calculate totals
  const totalSpent = formData.items.reduce((sum, item) => sum + item.amount, 0);
  const categoryData = calculateCategorySpending();
  const colors = ['#D4A574', '#E8C5A0', '#F4E4D0', '#FFF9E6', '#FFE4B5'];

  // Handle form input
  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
    setFormData({ ...formData, items: newItems });
  };

  // Add receipt
  const handleAddReceipt = () => {
    if (totalSpent > 0) {
      setReceipts([...receipts, {
        id: Date.now(),
        date: formData.date,
        items: formData.items,
        total: totalSpent
      }]);
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        items: [
          { category: 'Meat', amount: 0 },
          { category: 'Vegetables', amount: 0 },
          { category: 'Dairy', amount: 0 },
          { category: 'Grains', amount: 0 },
          { category: 'Other', amount: 0 }
        ]
      });
      setShowForm(false);
    }
  };

  // Mock Google Sign-In
  const handleGoogleSignIn = () => {
    setUser({ name: 'Demo User', email: 'user@example.com' });
  };

  const handleSignOut = () => {
    setUser(null);
    setReceipts([]);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Spending Tracker</h1>
          <p className="text-gray-600 mb-8">Analyze where your money goes</p>
          <button
            onClick={handleGoogleSignIn}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-8 rounded-lg transition"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Header */}
      <header className="bg-white border-b border-amber-100 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Spending Tracker</h1>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 pb-20">
        {/* Add Receipt Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-4 rounded-lg mb-6 transition flex items-center justify-center gap-2"
          >
            <span>+ Add Receipt</span>
          </button>
        )}

        {/* Receipt Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-amber-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4">New Receipt</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>

            <div className="space-y-3 mb-6">
              {formData.items.map((item, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={item.category}
                    onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount || ''}
                    onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                    placeholder="0.00"
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200">
              <p className="text-sm text-gray-600">Total: <span className="font-bold text-lg text-amber-700">${totalSpent.toFixed(2)}</span></p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddReceipt}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Save Receipt
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stats Overview */}
        {receipts.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-amber-600">
                <p className="text-gray-600 text-sm font-medium">Total Spent</p>
                <p className="text-2xl font-bold text-amber-700">${receipts.reduce((sum, r) => sum + r.total, 0).toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-orange-500">
                <p className="text-gray-600 text-sm font-medium">Receipts</p>
                <p className="text-2xl font-bold text-orange-600">{receipts.length}</p>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-amber-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Spending by Category</h2>
              <div className="space-y-3">
                {categoryData.map((cat, idx) => {
                  const total = categoryData.reduce((sum, c) => sum + c.value, 0);
                  const percentage = ((cat.value / total) * 100).toFixed(1);
                  return (
                    <div key={idx}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">{cat.name}</span>
                        <span className="text-sm font-bold text-amber-700">${cat.value.toFixed(2)} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-amber-600 h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Receipts */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-gray-800">Recent Receipts</h2>
              {receipts.reverse().map(receipt => (
                <div key={receipt.id} className="bg-white rounded-lg shadow-md p-4 border border-amber-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{receipt.date}</p>
                      <p className="text-sm text-gray-600">{receipt.items.filter(i => i.amount > 0).length} items</p>
                    </div>
                    <p className="font-bold text-amber-700 text-lg">${receipt.total.toFixed(2)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    {receipt.items.filter(i => i.amount > 0).map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.category}:</span>
                        <span className="font-semibold">${item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty State */}
        {receipts.length === 0 && !showForm && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">No receipts yet</p>
            <p className="text-gray-500 text-sm">Upload your first receipt to get started</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default CartFilter;
