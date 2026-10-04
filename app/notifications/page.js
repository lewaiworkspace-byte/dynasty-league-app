import { redirect } from 'next/navigation';

export const revalidate = 0;

/**
 * /notifications -- MOVED to /settings on October 4, 2026.
 *
 * The commissioner asked for one Owner Settings page holding the notification
 * choices, the automatic IR moves and the owner's contact card. Every email,
 * Discord DM and in-app link written before that date points here, so this
 * route stays and forwards rather than 404ing. app/notifications/actions.js
 * is NOT moved: components/NotificationPrefsForm.js still imports its two
 * Server Actions from there, and moving them would touch a file for nothing.
 */
export default function NotificationsMoved() {
  redirect('/settings#notifications');
}
