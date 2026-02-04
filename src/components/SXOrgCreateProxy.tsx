import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { 
  SXOrgClient,
  type SXOrgCountry,
  type SXOrgState,
  type SXOrgCity,
  type SXOrgProxyPort
} from '@/lib/sxorg-api';
import { Search, Check, Loader2, HelpCircle } from 'lucide-react';

type DeviceType = 'mobile' | 'residential' | 'datacenter';
type TabType = 'country' | 'region' | 'city' | 'advanced';
type BehaviorType = 'keep' | 'break' | 'rotate';

export function SXOrgCreateProxy({ 
  client,
  onProxiesCreated 
}: { 
  client: SXOrgClient;
  onProxiesCreated: (proxies: SXOrgProxyPort[]) => void;
}) {
  const [name, setName] = useState('');
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>(['mobile', 'residential', 'datacenter']);
  
  // Advanced settings
  const [proxyCount, setProxyCount] = useState(1);
  const [behaviorType, setBehaviorType] = useState<BehaviorType>('keep');
  const [rotateInterval, setRotateInterval] = useState(5); // minutes
  const [changeOnRequest, setChangeOnRequest] = useState(true);
  
  const [countries, setCountries] = useState<SXOrgCountry[]>([]);
  const [states, setStates] = useState<SXOrgState[]>([]);
  const [cities, setCities] = useState<SXOrgCity[]>([]);
  
  const [selectedCountry, setSelectedCountry] = useState<SXOrgCountry | null>(null);
  const [selectedState, setSelectedState] = useState<SXOrgState | null>(null);
  const [selectedCity, setSelectedCity] = useState<SXOrgCity | null>(null);
  
  const [activeTab, setActiveTab] = useState<TabType>('country');
  
  const [countrySearch, setCountrySearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart list - popular countries
  const smartListCountries = useMemo(() => ['US', 'GB', 'KZ', 'UA'], []);

  // Load countries only once
  useEffect(() => {
    let cancelled = false;
    
    const loadCountries = async () => {
      if (countries.length > 0) return; // Already loaded
      
      setLoadingCountries(true);
      try {
        const data = await client.getCountries();
        if (!cancelled) {
          setCountries(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load countries');
          console.error(err);
        }
      } finally {
        if (!cancelled) {
          setLoadingCountries(false);
        }
      }
    };

    loadCountries();
    
    return () => {
      cancelled = true;
    };
  }, []); // Run only once

  const handleCountrySelect = useCallback(async (country: SXOrgCountry) => {
    if (selectedCountry?.id === country.id) return; // Already selected
    
    setSelectedCountry(country);
    setSelectedState(null);
    setSelectedCity(null);
    setStates([]);
    setCities([]);
    setError(null);
    
    // Load states for this country
    setLoadingStates(true);
    try {
      const data = await client.getStates(country.id);
      setStates(data);
      // Если нет регионов, остаёмся на вкладке страны
      if (data.length > 0) {
        setActiveTab('region');
      }
    } catch (err) {
      setError('Failed to load regions');
      console.error('Error loading states:', err);
    } finally {
      setLoadingStates(false);
    }
  }, [client, selectedCountry]);

  const handleStateSelect = useCallback(async (state: SXOrgState) => {
    if (!selectedCountry) return;
    if (selectedState?.id === state.id) return;
    
    setSelectedState(state);
    setSelectedCity(null);
    setCities([]);
    setError(null);
    
    // Load cities for this country and state
    setLoadingCities(true);
    try {
      const data = await client.getCities(selectedCountry.id, state.id);
      setCities(data);
      setActiveTab('city');
    } catch (err) {
      setError('Failed to load cities');
      console.error(err);
    } finally {
      setLoadingCities(false);
    }
  }, [client, selectedCountry, selectedState]);

  const handleCitySelect = useCallback((city: SXOrgCity) => {
    setSelectedCity(city);
    setActiveTab('advanced');
  }, []);

  const handleDeviceTypeToggle = useCallback((type: DeviceType) => {
    setDeviceTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  }, []);

  const createProxyHandler = async () => {
    if (!selectedCountry || deviceTypes.length === 0) {
      setError('Please select a country and at least one device type');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // type_id: тип сессии
      // 1 = KEEP PROXY (не меняет IP)
      // 2 = KEEP_CONNECTION (держит соединение)  
      // 3 = ROTATE CONNECTION (меняет IP)
      const sessionTypeId = behaviorType === 'rotate' ? 3 : 
                           behaviorType === 'keep' ? 2 : 1;

      // proxy_type_id на основе выбранных типов устройств
      // 1 = MOBILE, 2 = RESIDENTIAL, 4 = CORPORATE
      let proxyTypeId = 4; // по умолчанию CORPORATE
      if (deviceTypes.includes('mobile')) {
        proxyTypeId = 1;
      } else if (deviceTypes.includes('residential')) {
        proxyTypeId = 2;
      }

      const result = await client.createProxy({
        country_code: selectedCountry.code,
        state_id: selectedState?.id,
        city_id: selectedCity?.id,
        name: name || `${selectedCountry.name}${selectedState ? ' - ' + selectedState.name : ''}${selectedCity ? ' - ' + selectedCity.name : ''}`,
        type_id: sessionTypeId,
        proxy_type_id: proxyTypeId,
        server_port_type_id: 0, // SHARED - один порт для всех (0=SHARED, 1=DEDICATED)
        count: proxyCount,
        ttl: behaviorType === 'rotate' ? rotateInterval : 1,
        traffic_limit: 0,
      });

      if (result.success && result.data) {
        // Добавляем информацию о стране и городе к каждому прокси
        const proxiesWithMetadata = result.data.map(proxy => ({
          ...proxy,
          countryCode: selectedCountry.code, // в верхнем регистре для API
          country_code: selectedCountry.code, // альтернативное поле
          country: selectedCountry.name,
          stateName: selectedState?.name,
          cityName: selectedCity?.name,
          city: selectedCity?.name,
          proxy_type_id: proxyTypeId,
        }));
        onProxiesCreated(proxiesWithMetadata);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create proxy');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const filteredCountries = useMemo(() => 
    countries.filter(c =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase())
    ),
    [countries, countrySearch]
  );

  const filteredStates = useMemo(() => 
    states.filter(s =>
      s.name.toLowerCase().includes(stateSearch.toLowerCase())
    ),
    [states, stateSearch]
  );

  const filteredCities = useMemo(() => 
    cities.filter(c =>
      c.name.toLowerCase().includes(citySearch.toLowerCase())
    ),
    [cities, citySearch]
  );

  const smartCountries = useMemo(() => 
    countries.filter(c => smartListCountries.includes(c.code)),
    [countries, smartListCountries]
  );

  return (
    <div className="space-y-6">
      {/* Header with Name and Device Types */}
      <div className="flex gap-4 pb-4 border-b">
        {/* Name Input */}
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Название</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название"
            className="w-full"
          />
        </div>

        {/* Device Type Selection */}
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Тип устройства</label>
          <div className="flex gap-2">
            {/* Mobile */}
            <button
              onClick={() => handleDeviceTypeToggle('mobile')}
              className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                deviceTypes.includes('mobile')
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.592 13.5753L10.467 13.4753C10.4205 13.4438 10.3701 13.4186 10.317 13.4003L10.167 13.3337C10.0318 13.3054 9.8918 13.3112 9.75943 13.3504C9.62706 13.3897 9.50653 13.4613 9.40866 13.5587C9.33505 13.6397 9.27586 13.7327 9.23366 13.8337C9.17059 13.9855 9.15385 14.1526 9.18554 14.3139C9.21723 14.4753 9.29593 14.6236 9.41174 14.7403C9.52755 14.857 9.67529 14.9368 9.83638 14.9698C9.99746 15.0027 10.1647 14.9872 10.317 14.9253C10.4166 14.877 10.5091 14.8153 10.592 14.742C10.7076 14.6248 10.786 14.476 10.8171 14.3143C10.8482 14.1527 10.8308 13.9854 10.767 13.8337C10.7254 13.7373 10.6661 13.6497 10.592 13.5753ZM13.3337 1.66699H6.66699C6.00395 1.66699 5.36807 1.93038 4.89923 2.39923C4.43038 2.86807 4.16699 3.50395 4.16699 4.16699V15.8337C4.16699 16.4967 4.43038 17.1326 4.89923 17.6014C5.36807 18.0703 6.00395 18.3337 6.66699 18.3337H13.3337C13.9967 18.3337 14.6326 18.0703 15.1014 17.6014C15.5703 17.1326 15.8337 16.4967 15.8337 15.8337V4.16699C15.8337 3.50395 15.5703 2.86807 15.1014 2.39923C14.6326 1.93038 13.9967 1.66699 13.3337 1.66699ZM14.167 15.8337C14.167 16.0547 14.0792 16.2666 13.9229 16.4229C13.7666 16.5792 13.5547 16.667 13.3337 16.667H6.66699C6.44598 16.667 6.23402 16.5792 6.07774 16.4229C5.92146 16.2666 5.83366 16.0547 5.83366 15.8337V4.16699C5.83366 3.94598 5.92146 3.73402 6.07774 3.57774C6.23402 3.42146 6.44598 3.33366 6.66699 3.33366H13.3337C13.5547 3.33366 13.7666 3.42146 13.9229 3.57774C14.0792 3.73402 14.167 3.94598 14.167 4.16699V15.8337Z"/>
                </svg>
                {deviceTypes.includes('mobile') && (
                  <Check className="w-3 h-3 text-purple-600" />
                )}
              </div>
            </button>

            {/* Residential */}
            <button
              onClick={() => handleDeviceTypeToggle('residential')}
              className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                deviceTypes.includes('residential')
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M18.0533 8.54319L10.5533 1.87652C10.4009 1.74092 10.204 1.66602 10 1.66602C9.796 1.66602 9.59909 1.74092 9.44667 1.87652L1.94667 8.54319C1.78135 8.68994 1.6811 8.89636 1.66798 9.11702C1.65485 9.33769 1.72992 9.55454 1.87667 9.71985C2.02343 9.88517 2.22984 9.98542 2.45051 9.99855C2.67118 10.0117 2.88802 9.93661 3.05334 9.78985L3.33334 9.54069V17.4999C3.33334 17.7209 3.42114 17.9328 3.57742 18.0891C3.7337 18.2454 3.94566 18.3332 4.16667 18.3332H15.8333C16.0544 18.3332 16.2663 18.2454 16.4226 18.0891C16.5789 17.9328 16.6667 17.7209 16.6667 17.4999V9.54069L16.9467 9.78985C17.112 9.93661 17.3288 10.0117 17.5495 9.99855C17.6588 9.99205 17.7657 9.96409 17.8641 9.91627C17.9626 9.86845 18.0507 9.80171 18.1233 9.71985C18.196 9.638 18.2518 9.54263 18.2876 9.43919C18.3235 9.33576 18.3385 9.22629 18.332 9.11702C18.3255 9.00776 18.2976 8.90085 18.2498 8.80239C18.2019 8.70393 18.1352 8.61585 18.0533 8.54319ZM7.65334 16.6665C7.82304 16.1794 8.14013 15.7572 8.56063 15.4584C8.98112 15.1596 9.48417 14.9991 10 14.9991C10.5158 14.9991 11.0189 15.1596 11.4394 15.4584C11.8599 15.7572 12.177 16.1794 12.3467 16.6665H7.65334ZM8.75 12.0832C8.75 11.836 8.82332 11.5943 8.96067 11.3887C9.09802 11.1832 9.29324 11.0229 9.52165 10.9283C9.75006 10.8337 10.0014 10.809 10.2439 10.8572C10.4863 10.9054 10.7091 11.0245 10.8839 11.1993C11.0587 11.3741 11.1778 11.5968 11.226 11.8393C11.2742 12.0818 11.2495 12.3331 11.1549 12.5615C11.0602 12.7899 10.9 12.9852 10.6945 13.1225C10.4889 13.2599 10.2472 13.3332 10 13.3332C9.66862 13.3327 9.35093 13.2009 9.11661 12.9666C8.88228 12.7323 8.75045 12.4146 8.75 12.0832ZM15 16.6665H14.0825C13.9673 16.114 13.741 15.5907 13.4174 15.1283C13.0938 14.6659 12.6796 14.274 12.2 13.9765C12.6594 13.4525 12.9139 12.7801 12.9167 12.0832C12.9167 11.3096 12.6094 10.5678 12.0624 10.0208C11.5154 9.47381 10.7736 9.16652 10 9.16652C9.22646 9.16652 8.48459 9.47381 7.93761 10.0208C7.39063 10.5678 7.08334 11.3096 7.08334 12.0832C7.08614 12.7801 7.34065 13.4525 7.8 13.9765C7.32024 14.2739 6.90591 14.6658 6.58217 15.1282C6.25842 15.5906 6.03201 16.114 5.91667 16.6665H5.00001V8.05902L10 3.61485L15 8.05902V16.6665Z"/>
                </svg>
                {deviceTypes.includes('residential') && (
                  <Check className="w-3 h-3 text-purple-600" />
                )}
              </div>
            </button>

            {/* Datacenter */}
            <button
              onClick={() => handleDeviceTypeToggle('datacenter')}
              className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                deviceTypes.includes('datacenter')
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <svg width="20" height="20" viewBox="0 0 21 20" fill="currentColor">
                  <path d="M12.167 6.66699H13.0003C13.2213 6.66699 13.4333 6.5792 13.5896 6.42291C13.7459 6.26663 13.8337 6.05467 13.8337 5.83366C13.8337 5.61265 13.7459 5.40068 13.5896 5.2444C13.4333 5.08812 13.2213 5.00033 13.0003 5.00033H12.167C11.946 5.00033 11.734 5.08812 11.5777 5.2444C11.4215 5.40068 11.3337 5.61265 11.3337 5.83366C11.3337 6.05467 11.4215 6.26663 11.5777 6.42291C11.734 6.5792 11.946 6.66699 12.167 6.66699ZM12.167 10.0003H13.0003C13.2213 10.0003 13.4333 9.91253 13.5896 9.75625C13.7459 9.59997 13.8337 9.38801 13.8337 9.16699C13.8337 8.94598 13.7459 8.73402 13.5896 8.57774C13.4333 8.42146 13.2213 8.33366 13.0003 8.33366H12.167C11.946 8.33366 11.734 8.42146 11.5777 8.57774C11.4215 8.73402 11.3337 8.94598 11.3337 9.16699C11.3337 9.38801 11.4215 9.59997 11.5777 9.75625C11.734 9.91253 11.946 10.0003 12.167 10.0003ZM8.00033 6.66699H8.83366C9.05467 6.66699 9.26663 6.5792 9.42291 6.42291C9.5792 6.26663 9.66699 6.05467 9.66699 5.83366C9.66699 5.61265 9.5792 5.40068 9.42291 5.2444C9.26663 5.08812 9.05467 5.00033 8.83366 5.00033H8.00033C7.77931 5.00033 7.56735 5.08812 7.41107 5.2444C7.25479 5.40068 7.16699 5.61265 7.16699 5.83366C7.16699 6.05467 7.25479 6.26663 7.41107 6.42291C7.56735 6.5792 7.77931 6.66699 8.00033 6.66699ZM8.00033 10.0003H8.83366C9.05467 10.0003 9.26663 9.91253 9.42291 9.75625C9.5792 9.59997 9.66699 9.38801 9.66699 9.16699C9.66699 8.94598 9.5792 8.73402 9.42291 8.57774C9.26663 8.42146 9.05467 8.33366 8.83366 8.33366H8.00033C7.77931 8.33366 7.56735 8.42146 7.41107 8.57774C7.25479 8.73402 7.16699 8.94598 7.16699 9.16699C7.16699 9.38801 7.25479 9.59997 7.41107 9.75625C7.56735 9.91253 7.77931 10.0003 8.00033 10.0003ZM18.0003 16.667H17.167V2.50033C17.167 2.27931 17.0792 2.06735 16.9229 1.91107C16.7666 1.75479 16.5547 1.66699 16.3337 1.66699H4.66699C4.44598 1.66699 4.23402 1.75479 4.07774 1.91107C3.92146 2.06735 3.83366 2.27931 3.83366 2.50033V16.667H3.00033C2.77931 16.667 2.56735 16.7548 2.41107 16.9111C2.25479 17.0674 2.16699 17.2793 2.16699 17.5003C2.16699 17.7213 2.25479 17.9333 2.41107 18.0896C2.56735 18.2459 2.77931 18.3337 3.00033 18.3337H18.0003C18.2213 18.3337 18.4333 18.2459 18.5896 18.0896C18.7459 17.9333 18.8337 17.7213 18.8337 17.5003C18.8337 17.2793 18.7459 17.0674 18.5896 16.9111C18.4333 16.7548 18.2213 16.667 18.0003 16.667ZM11.3337 16.667H9.66699V13.3337H11.3337V16.667ZM15.5003 16.667H13.0003V12.5003C13.0003 12.2793 12.9125 12.0674 12.7562 11.9111C12.6 11.7548 12.388 11.667 12.167 11.667H8.83366C8.61265 11.667 8.40068 11.7548 8.2444 11.9111C8.08812 12.0674 8.00033 12.2793 8.00033 12.5003V16.667H5.50033V3.33366H15.5003V16.6667Z"/>
                </svg>
                {deviceTypes.includes('datacenter') && (
                  <Check className="w-3 h-3 text-purple-600" />
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('country')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'country'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500'
          }`}
        >
          {selectedCountry && <Check className="w-4 h-4 text-green-600" />}
          <span className="font-medium">Страна</span>
        </button>

        <button
          onClick={() => selectedCountry && setActiveTab('region')}
          disabled={!selectedCountry}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'region'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-400'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {selectedState && <Check className="w-4 h-4 text-green-600" />}
          <span className="font-medium">Регион</span>
        </button>

        <button
          onClick={() => selectedState && setActiveTab('city')}
          disabled={!selectedState}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'city'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-400'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {selectedCity && <Check className="w-4 h-4 text-green-600" />}
          <span className="font-medium">Город</span>
        </button>

        <button
          onClick={() => selectedCity && setActiveTab('advanced')}
          disabled={!selectedCity}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'advanced'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-400'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="font-medium">Расширенные настройки</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Country Tab */}
        {activeTab === 'country' && (
          <div className="space-y-4">
            {loadingCountries ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    placeholder="Поиск по стране"
                    className="pl-10"
                  />
                </div>

                {/* Smart List */}
                {smartCountries.length > 0 && !countrySearch && (
                  <div>
                    <h5 className="text-sm font-semibold mb-3">Смарт-список стран</h5>
                    <div className="grid grid-cols-2 gap-2">
                      {smartCountries.map((country) => (
                        <button
                          key={country.code}
                          onClick={() => handleCountrySelect(country)}
                          disabled={loadingStates}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
                        >
                          <span className={`fi fi-${country.code.toLowerCase()} text-2xl`}></span>
                          <span className="flex-1 font-medium">{country.name}</span>
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded">
                            Много
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Countries */}
                <div>
                  <h5 className="text-sm font-semibold mb-3">Все страны</h5>
                  <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {filteredCountries.map((country) => (
                      <button
                        key={country.code}
                        onClick={() => handleCountrySelect(country)}
                        disabled={loadingStates}
                        className="flex items-center gap-2 p-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left text-sm disabled:opacity-50"
                      >
                        <span className={`fi fi-${country.code.toLowerCase()}`}></span>
                        <span className="flex-1 truncate">{country.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Region Tab */}
        {activeTab === 'region' && (
          <div className="space-y-4">
            {loadingStates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={stateSearch}
                    onChange={(e) => setStateSearch(e.target.value)}
                    placeholder="Поиск по региону"
                    className="pl-10"
                  />
                </div>
                {filteredStates.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                    {filteredStates.map((state) => (
                      <button
                        key={state.id}
                        onClick={() => handleStateSelect(state)}
                        disabled={loadingCities}
                        className={`p-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                          selectedState?.id === state.id
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {state.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="mb-2 text-sm">Нет доступных регионов</div>
                    <div className="text-xs">Для этой страны регионы не требуются</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* City Tab */}
        {activeTab === 'city' && (
          <div className="space-y-4">
            {loadingCities ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder="Поиск по городу"
                    className="pl-10"
                  />
                </div>
                {filteredCities.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                    {filteredCities.map((city, idx) => (
                      <button
                      key={city.id}
                        onClick={() => handleCitySelect(city)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          selectedCity?.id === city.id
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {city.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="mb-2 text-sm">Нет доступных городов</div>
                    <div className="text-xs">Для этого региона города не требуются</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Advanced Settings Tab */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            {/* Name Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Название</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${selectedCountry?.name}${selectedState ? ' - ' + selectedState.name : ''}${selectedCity ? ' - ' + selectedCity.name : ''}`}
                className="w-full"
              />
            </div>

            {/* Proxy Count */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium">Количество</label>
                <div className="group relative">
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="invisible group-hover:visible absolute left-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                    Количество создаваемых прокси
                  </div>
                </div>
              </div>
              <Input
                type="number"
                min="1"
                value={proxyCount}
                onChange={(e) => setProxyCount(parseInt(e.target.value) || 1)}
                className="w-full"
              />
            </div>

            {/* Behavior Type */}
            <div className="space-y-3">
              <label className="block text-sm font-medium">Поведение, когда прокси умирает</label>
              
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="behavior"
                  checked={behaviorType === 'keep'}
                  onChange={() => setBehaviorType('keep')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium">Сохранить соединение (ВЫСОКОЕ ДОВЕРИЕ) *Рекомендуется</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Мы автоматически встроили проверку на тот или иной подсети есть тор-же ASN. Для конечного сайте будет выглядеть что вас сменился IP вы остались в тоге же провайдера и это не вызовет подозрений
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="behavior"
                  checked={behaviorType === 'break'}
                  onChange={() => setBehaviorType('break')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium">Разрывать соединение</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Если IP-адрес откликнулся, соединение будет потеряно до тех пор, пока IP-адрес не восстановится
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  name="behavior"
                  checked={behaviorType === 'rotate'}
                  onChange={() => setBehaviorType('rotate')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium">Ротировать</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Смена IP-адреса по запросу и при переподключении
                  </div>
                  {behaviorType === 'rotate' && (
                    <div className="mt-3 space-y-3 pl-6">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={changeOnRequest}
                          onChange={(e) => setChangeOnRequest(e.target.checked)}
                        />
                        <span className="text-sm">Менять на каждый запрос</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2">
                          <span className="text-sm">Менять IP каждые</span>
                          <Input
                            type="number"
                            min="1"
                            value={rotateInterval}
                            onChange={(e) => setRotateInterval(parseInt(e.target.value) || 5)}
                            className="w-20"
                          />
                          <span className="text-sm">мин.</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Button
        onClick={createProxyHandler}
        disabled={creating || !selectedCountry || deviceTypes.length === 0 || activeTab !== 'advanced' || loadingStates || loadingCities}
        className="w-full"
      >
        {creating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Создание...
          </>
        ) : (
          'Создать прокси'
        )}
      </Button>
    </div>
  );
}

export default SXOrgCreateProxy;
