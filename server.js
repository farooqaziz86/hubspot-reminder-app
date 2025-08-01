const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const sgMail = require('@sendgrid/mail');
const app = express();

// Set SendGrid API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// MongoDB Schema
const DealSchema = new mongoose.Schema({
  recordId: String,
  dealName: String,
  dealOwner: String,
  lastActivityDate: Date,
  secondOwner: String,
  dealStage: String,
});
const Deal = mongoose.model('Deal', DealSchema);

// Configure Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Serve static files
app.use(express.static('public'));

// Route to serve upload page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to handle CSV upload
app.post('/upload', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      results.push({
        recordId: data['Record ID'],
        dealName: data['Deal Name'],
        dealOwner: data['Deal owner'],
        lastActivityDate: data['Last Activity Date'] ? new Date(data['Last Activity Date'].replace(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})/, '$3-$2-$1 $4')) : null,
        secondOwner: data['Second Owner'],
        dealStage: data['Deal Stage'],
      });
    })
    .on('end', async () => {
      try {
        await Deal.deleteMany({});
        await Deal.insertMany(results);
        fs.unlinkSync(req.file.path);
        res.send('CSV uploaded and processed successfully.');
      } catch (err) {
        console.error(err);
        res.status(500).send('Error processing CSV.');
      }
    });
});

// Email configuration
const ownerEmails = {
  'Farooq Aziz': 'farooq@xstak.com',
  'Omer Zia': 'omer.zia@xstak.com',
  'Bairum khan': 'bairum.khan@xstak.com',
  'Shumaila Rafique': 'shumaila.rafique@xstak.com',
  'Ammar Yasir': 'ammar.yasir@postex.pk',
  'arslan.tariq@postex.pk': 'arslan.tariq@postex.pk',
  'rakhshan.shaheer@postex.pk': 'rakhshan.shaheer@postex.pk',
  'raafay.qureshi@postex.pk': 'raafay.qureshi@postex.pk',
};
const ccEmails = ['noshairwan.khan@postex.pk', 'farooq@xstak.com'];
const daysThreshold = parseInt(process.env.DAYS_THRESHOLD) || 10;

// Function to send reminder emails with summary
async function sendReminderEmails() {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

  const deals = await Deal.find({
    lastActivityDate: { $lt: thresholdDate },
    dealStage: { $ne: 'Closed' },
  });

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

// Schedule email reminders daily at 9 AM CEST (7 AM UTC)
cron.schedule('0 7 * * *', sendReminderEmails);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
