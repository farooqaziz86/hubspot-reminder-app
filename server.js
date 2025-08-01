// Function to send reminder emails with summary
async function sendReminderEmails() {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

  const deals = await Deal.find({
    lastActivityDate: { $lt: thresholdDate },
    dealStage: { $ne: 'Closed' },
  });

  // Group deals by recipient (owner or second owner)
  const emailMap = {};
  for (const deal of deals) {
    const recipient = deal.secondOwner && ownerEmails[deal.secondOwner] ? deal.secondOwner : deal.dealOwner;
    const email = ownerEmails[recipient];
    if (!email) continue;

    if (!emailMap[email]) {
      emailMap[email] = [];
    }
    emailMap[email].push(deal.dealName);
  }

  // Send one email per recipient with a summary
  for (const [email, dealNames] of Object.entries(emailMap)) {
    const msg = {
      to: email,
      cc: ccEmails,
      from: process.env.SENDER_EMAIL,
      subject: `Reminder: Follow up on ${dealNames.length} inactive deals`,
      text: `Please contact the following deals:\n\n${dealNames.map(name => `- ${name}`).join('\n')}\n\nLast activity was over ${daysThreshold} days ago.`,
    };

    try {
      await sgMail.send(msg);
      console.log(`Summary email sent to ${email} for ${dealNames.length} deals`);
    } catch (err) {
      console.error(`Error sending summary email to ${email}:`, err);
    }
  }
}
