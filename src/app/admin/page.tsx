'use client';

import { useState, useEffect } from 'react';

export default function AdminPage() {
  const [defaultUsers, setDefaultUsers] = useState<string[]>([]);
  const [newUserId, setNewUserId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Fetch current default users
  useEffect(() => {
    const fetchDefaultUsers = async () => {
      try {
        const response = await fetch('/api/default-users');
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.defaultUsers)) {
            setDefaultUsers(data.defaultUsers);
          }
        } else {
          setError('Failed to fetch default users');
        }
      } catch (err) {
        setError('Error fetching default users');
        console.error(err);
      }
    };

    fetchDefaultUsers();
  }, []);

  // Save default users
  const saveDefaultUsers = async () => {
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/default-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: defaultUsers }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage('Default users updated successfully');
      } else {
        setError(data.error || 'Failed to update default users');
      }
    } catch (err) {
      setError('Error updating default users');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Add a new user ID
  const addUserId = () => {
    if (!newUserId.trim()) return;

    // Check if user ID already exists
    if (defaultUsers.includes(newUserId.trim())) {
      setError('User ID already exists in the list');
      return;
    }

    setDefaultUsers([...defaultUsers, newUserId.trim()]);
    setNewUserId('');
  };

  // Remove a user ID
  const removeUserId = (userId: string) => {
    setDefaultUsers(defaultUsers.filter(id => id !== userId));
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 text-black">
      <h1 className="mb-6 text-2xl font-bold">Admin - Configure Default Users</h1>

      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700">
          {message}
        </div>
      )}

      <div className="mb-6 rounded bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold">Default Users for New Channels</h2>
        <p className="mb-4 text-gray-600">
          These users will automatically be invited to all newly created channels. Use Slack User
          IDs (format: UXXXXXXXX).
        </p>

        <div className="mb-4 flex">
          <input
            type="text"
            value={newUserId}
            onChange={e => setNewUserId(e.target.value)}
            placeholder="Enter Slack User ID"
            className="flex-grow rounded-l border border-gray-300 px-3 py-2 focus:outline-none"
          />
          <button
            onClick={addUserId}
            className="rounded-r bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Add
          </button>
        </div>

        <ul className="mb-6">
          {defaultUsers.length === 0 ? (
            <li className="text-gray-500 italic">No default users configured</li>
          ) : (
            defaultUsers.map(userId => (
              <li key={userId} className="flex items-center justify-between border-b py-2">
                <span>{userId}</span>
                <button
                  onClick={() => removeUserId(userId)}
                  className="text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>

        <button
          onClick={saveDefaultUsers}
          disabled={isLoading}
          className="w-full rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:bg-gray-400"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="rounded bg-gray-100 p-4 text-black">
        <h3 className="mb-2 font-semibold">How to find Slack User IDs</h3>
        <ol className="list-inside list-decimal text-sm">
          <li>Open Slack in a browser</li>
          <li>Click on a user&apos;s profile picture</li>
          <li>Click &quot;View full profile&quot;</li>
          <li>
            In the URL, look for &quot;user_profile/&quot; followed by the ID (e.g., U01ABCDEFGH)
          </li>
        </ol>
      </div>
    </div>
  );
}
