document.addEventListener('DOMContentLoaded', () => {
    const cityInput = document.getElementById('city-input');
    const searchBtn = document.getElementById('search-btn');
    const suggestionsList = document.getElementById('suggestions-list');
    const weatherCard = document.getElementById('weather-card');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');

    // UI Elements to update
    const cityNameEl = document.getElementById('city-name');
    const dateEl = document.getElementById('date');
    const tempEl = document.getElementById('temperature');
    const weatherDescEl = document.getElementById('weather-desc');
    const feelsLikeEl = document.getElementById('feels-like');
    const humidityEl = document.getElementById('humidity');
    const windSpeedEl = document.getElementById('wind-speed');

    // WMO Weather interpretation codes (Open-Meteo)
    const weatherCodes = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
    };

    // Event Listeners
    searchBtn.addEventListener('click', handleSearch);
    cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Autocomplete Event Listeners
    cityInput.addEventListener('input', debounce(handleInput, 150));

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) {
            suggestionsList.classList.add('hidden');
        }
    });

    // Debounce Utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // AbortController for cancelling stale requests
    let currentController = null;

    // Handle Input for Autocomplete
    async function handleInput() {
        const query = cityInput.value.trim();

        // Cancel previous request if it exists
        if (currentController) {
            currentController.abort();
        }

        if (query.length < 2) {
            suggestionsList.classList.add('hidden');
            return;
        }

        // Create new controller for this request
        currentController = new AbortController();
        const signal = currentController.signal;

        try {
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`, { signal });
            if (!response.ok) return;
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                renderSuggestions(data.results);
            } else {
                suggestionsList.classList.add('hidden');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                // Ignore aborted requests
                return;
            }
            console.error('Error fetching suggestions:', error);
        }
    }

    // Render Suggestions
    function renderSuggestions(cities) {
        suggestionsList.innerHTML = '';
        cities.forEach(city => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';

            // Construct location string: City, Admin Area, Country
            const parts = [city.name];
            if (city.admin1) parts.push(city.admin1);
            if (city.country) parts.push(city.country);

            li.textContent = parts.join(', ');

            li.addEventListener('click', () => {
                cityInput.value = city.name;
                suggestionsList.classList.add('hidden');
                // Trigger weather fetch directly with lat/lon
                fetchWeatherByCoords(city.latitude, city.longitude, city.name, city.country);
            });

            suggestionsList.appendChild(li);
        });
        suggestionsList.classList.remove('hidden');
    }

    // Main Search Handler (Fallback for manual entry)
    async function handleSearch() {
        const city = cityInput.value.trim();
        if (!city) return;

        suggestionsList.classList.add('hidden');

        // Reset UI
        showError(null);
        showLoading(true);
        weatherCard.classList.add('hidden');

        try {
            // 1. Geocoding API to get Lat/Lon
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
            const geoResponse = await fetch(geoUrl);

            if (!geoResponse.ok) throw new Error('Geocoding service unavailable');

            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                throw new Error('City not found. Please try again.');
            }

            const { latitude, longitude, name, country } = geoData.results[0];

            // 2. Fetch Weather using the coords
            await fetchWeatherByCoords(latitude, longitude, name, country);

        } catch (error) {
            showError(error.message);
            showLoading(false);
        }
    }

    // Fetch Weather Data
    async function fetchWeatherByCoords(lat, lon, name, country) {
        // Ensure UI is in loading state (redundant if called from handleSearch, but needed for click handler)
        showError(null);
        showLoading(true);
        weatherCard.classList.add('hidden');

        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;

            const weatherResponse = await fetch(weatherUrl);

            if (!weatherResponse.ok) throw new Error('Weather service unavailable');

            const weatherData = await weatherResponse.json();

            // Update UI
            updateWeatherUI(weatherData, name, country);

        } catch (error) {
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }

    function updateWeatherUI(data, city, country) {
        const current = data.current;

        // Format Date
        const date = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'short' };
        dateEl.textContent = date.toLocaleDateString('en-US', options);

        // Update Text Content
        cityNameEl.textContent = `${city}, ${country || ''}`;
        tempEl.textContent = Math.round(current.temperature_2m);

        const code = current.weather_code;
        weatherDescEl.textContent = weatherCodes[code] || 'Unknown';

        feelsLikeEl.textContent = `${Math.round(current.apparent_temperature)}°C`;
        humidityEl.textContent = `${current.relative_humidity_2m}%`;
        windSpeedEl.textContent = `${current.wind_speed_10m} km/h`;

        // Show card with animation
        weatherCard.classList.remove('hidden');
    }

    function showLoading(isLoading) {
        if (isLoading) {
            loadingSpinner.classList.remove('hidden');
            searchBtn.disabled = true;
        } else {
            loadingSpinner.classList.add('hidden');
            searchBtn.disabled = false;
        }
    }

    function showError(message) {
        if (message) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');
        } else {
            errorMessage.classList.add('hidden');
        }
    }
});
