import express from 'express';

const app = express();
const PORT = 3001;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'CareThread backend is running!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

