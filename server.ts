import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: 'http://localhost:3000' // your Next.js frontend
}));

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'CareThread backend is running!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

