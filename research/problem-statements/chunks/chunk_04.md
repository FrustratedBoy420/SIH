## SIH26061 — AI-Driven Smart Energy Management System for Polar Research Stations
- Category: Software | Theme: Clean & Green Technology
- Org: Ministry of Earth Sciences (MoES) | Dept: National Centre for Polar andOcean Research (NCPOR)

Develop an intelligent energy-management system using AI for load forecasting, renewable energy integration and fuel optimization under extreme polar conditions. -->
Develop an intelligent energy-management system using AI for load forecasting, renewable energy integration and fuel optimization under extreme polar conditions.

---

## SIH26062 — Integrated Polar Expedition Logistics and Asset Management System
- Category: Software | Theme: Smart Automation
- Org: Ministry of Earth Sciences (MoES) | Dept: National Centre for Polar andOcean Research (NCPOR)

Develop a centralized digital platform for expedition planning, cargo tracking, inventory management, personnel movement and emergency response. -->
Develop a centralized digital platform for expedition planning, cargo tracking, inventory management, personnel movement and emergency response.

---

## SIH26063 — Integrated Polar Science Outreach, Knowledge Repository and Media Dissemination Portal
- Category: Software | Theme: Smart Education
- Org: Ministry of Earth Sciences (MoES) | Dept: National Centre for Polar andOcean Research (NCPOR)

Develop a comprehensive outreach portal that archives expedition reports, scientific datasets, publications, photographs, videos and institutional activities while generating content for websites and social media. -->
Develop a comprehensive outreach portal that archives expedition reports, scientific datasets, publications, photographs, videos and institutional activities while generating content for websites and social media.

---

## SIH26064 — Low-Cost Deployable Seafloor Metal Detection Sensor for Ocean Resource Exploration
- Category: Hardware | Theme: Robotics and Drones
- Org: Ministry of Earth Sciences (MoES) | Dept: National Centre for Polar andOcean Research (NCPOR)

Design and develop a low-cost deployable ocean-bottom sensor that can be released from a research vessel during surveys to detect and map metal-rich seabed deposits, including polymetallic nodules, hydrothermal sulphides, cobalt-rich crusts and rare-earth-element-bearing sediments, providing a rapid and cost-effective tool for deep-ocean mineral exploration. -->
Design and develop a low-cost deployable ocean-bottom sensor that can be released from a research vessel during surveys to detect and map metal-rich seabed deposits, including polymetallic nodules, hydrothermal sulphides, cobalt-rich crusts and rare-earth-element-bearing sediments, providing a rapid and cost-effective tool for deep-ocean mineral exploration.

---

## SIH26065 — Autonomous Low-Cost Ocean Observation Platform for Polar and Southern Oceans
- Category: Hardware | Theme: Robotics and Drones
- Org: Ministry of Earth Sciences (MoES) | Dept: National Centre for Polar andOcean Research (NCPOR)

Design and develop an indigenous, low-cost, autonomous ocean observation platform capable of long-term deployment in harsh polar and Southern Ocean environments for measuring key oceanographic and atmospheric parameters. -->
Design and develop an indigenous, low-cost, autonomous ocean observation platform capable of long-term deployment in harsh polar and Southern Ocean environments for measuring key oceanographic and atmospheric parameters.

---

## SIH26066 — OceanEmbed - Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations.
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: Indian National Centre for Ocean Information Services (INCOIS) Ocean Valley
- Dataset: Additional Information regarding PS
https://drive.google.com/file/d/1TrME3MMW-aYaf7KNmDXpwl2CcvLYjp-T/view?usp=drive_link

Background
Subsurface ocean temperature is a fundamental variable for understanding ocean circulation,
upper-ocean heat content, stratification, climate variability, air-sea interaction and marine ecosystems.
Accurate representation of the vertical ocean temperature is essential for applications such as
marine heatwave monitoring, fisheries, and data assimilation, etc.
However, direct measurements of subsurface temperature remain sparse because they rely primarily
on in-situ observing systems such as ARGO profiling floats, moored buoys, gliders, and ship observations.
While these observations provide valuable vertical information, their spatial and temporal coverage
is insufficient for generating continuous, basin-scale subsurface fields.
In contrast, satellite observations provide continuous, large-scale monitoring of surface ocean
conditions at relatively high spatial and temporal resolution. Surface variables such as
Sea Surface Temperature (SST), Sea Surface Salinity (SSS), Sea Surface Height (SSH) /
Sea Level Anomaly (SLA), surface currents, and surface winds contain indirect signatures of
subsurface ocean processes through physical mechanisms including thermocline displacement,
mesoscale eddies, vertical mixing, transport, and ocean-atmosphere coupling.
Recent advances in Artificial Intelligence (AI), Deep Learning (DL), and representation learning
enable the generation of satellite embeddings, where multidimensional surface observations are
transformed into compact latent representations that capture hidden ocean dynamics.
Such embeddings offer the potential to learn nonlinear relationships between surface observations
and subsurface ocean structure more effectively than conventional machine learning approaches.
Detailed Description
The current problem statement proposes the development of a
Satellite Embedding-Based Deep Learning Framework to reconstruct depth-wise
subsurface temperature from daily surface satellite observations at
0.25&deg; spatial resolution for
North Indian Ocean (5&deg;N to 30&deg;N and 45&deg;E to 105&deg;E) .
The objective is to estimate the three-dimensional ocean temperature using only surface
satellite observations.
The proposed system shall:
Develop a preprocessing and harmonization pipeline for multi-source satellite and ocean datasets.
Standardize all datasets to:
Spatial Resolution: 0.25&deg; &times; 0.25&deg;
Temporal Resolution: Daily
Use surface observations as input variables:
Sea Surface Temperature (SST)
Sea Surface Salinity (SSS)
Sea Surface Height (SSH) / Sea Level Anomaly (SLA)
Surface ocean currents (U, V)
Surface Winds (U, V)
Generate compact satellite embeddings using DL architectures such as:
Convolutional Neural Networks (CNN)
Vision Transformers (ViT)
Autoencoders
Graph Neural Networks (GNN)
Attention-based hybrid architectures
Train reconstruction models that learn the relationship between surface ocean state
to temperature profiles.
Reconstruct:
Temperature at standard depth levels.
Standard depths in meters:
(0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000)
Evaluate the reconstruction using independent observations and standard skill metrics
like correlation, RMSE, Bias, etc.
If a dataset is not available at required resolution, the team may select the openly available
product and perform appropriate spatial and temporal interpolation/regridding.
Training Input Datasets
The following datasets are recommended for building the training and evaluation pipeline.
(Insert table here)
Training Target Dataset (Subsurface Temperature)
GLORYS Global Ocean Reanalysis
https://doi.org/10.48670/moi-00021
Variables: Temperature
In-situ Observations Dataset
Gridded ARGO
INCOIS Live Access Server (LAS) &ndash; Gridded ARGO
Expected Solution
End-to-end preprocessing pipeline for satellite and ocean datasets.
Satellite embedding engine capable of learning latent ocean representations from
surface observations.
Deep learning reconstruction model for estimating subsurface temperature.
Standardized output at daily temporal resolution and 0.25&deg; spatial resolution.
Validation framework using independent ARGO observations.
Demonstration of a working Proof-of-Concept (PoC) over the Bay of Bengal / Arabian Sea.
-->
Background
Subsurface ocean temperature is a fundamental variable for understanding ocean circulation,
upper-ocean heat content, stratification, climate variability, air-sea interaction and marine ecosystems.
Accurate representation of the vertical ocean temperature is essential for applications such as
marine heatwave monitoring, fisheries, and data assimilation, etc.
However, direct measurements of subsurface temperature remain sparse because they rely primarily
on in-situ observing systems such as ARGO profiling floats, moored buoys, gliders, and ship observations.
While these observations provide valuable vertical information, their spatial and temporal coverage
is insufficient for generating continuous, basin-scale subsurface fields.
In contrast, satellite observations provide continuous, large-scale monitoring of surface ocean
conditions at relatively high spatial and temporal resolution. Surface variables such as
Sea Surface Temperature (SST), Sea Surface Salinity (SSS), Sea Surface Height (SSH) /
Sea Level Anomaly (SLA), surface currents, and surface winds contain indirect signatures of
subsurface ocean processes through physical mechanisms including thermocline displacement,
mesoscale eddies, vertical mixing, transport, and ocean-atmosphere coupling.
Recent advances in Artificial Intelligence (AI), Deep Learning (DL), and representation learning
enable the generation of satellite embeddings, where multidimensional surface observations are
transformed into compact latent representations that capture hidden ocean dynamics.
Such embeddings offer the potential to learn nonlinear relationships between surface observations
and subsurface ocean structure more effectively than conventional machine learning approaches.
Detailed Description
The current problem statement proposes the development of a
Satellite Embedding-Based Deep Learning Framework to reconstruct depth-wise
subsurface temperature from daily surface satellite observations at
0.25° spatial resolution for
North Indian Ocean (5°N to 30°N and 45°E to 105°E) .
The objective is to estimate the three-dimensional ocean temperature using only surface
satellite observations.
The proposed system shall:
Develop a preprocessing and harmonization pipeline for multi-source satellite and ocean datasets.
Standardize all datasets to:
Spatial Resolution: 0.25° × 0.25°
Temporal Resolution: Daily
Use surface observations as input variables:
Sea Surface Temperature (SST)
Sea Surface Salinity (SSS)
Sea Surface Height (SSH) / Sea Level Anomaly (SLA)
Surface ocean currents (U, V)
Surface Winds (U, V)
Generate compact satellite embeddings using DL architectures such as:
Convolutional Neural Networks (CNN)
Vision Transformers (ViT)
Autoencoders
Graph Neural Networks (GNN)
Attention-based hybrid architectures
Train reconstruction models that learn the relationship between surface ocean state
to temperature profiles.
Reconstruct:
Temperature at standard depth levels.
Standard depths in meters:
(0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000)
Evaluate the reconstruction using independent observations and standard skill metrics
like correlation, RMSE, Bias, etc.
If a dataset is not available at required resolution, the team may select the openly available
product and perform appropriate spatial and temporal interpolation/regridding.
Training Input Datasets
The following datasets are recommended for building the training and evaluation pipeline.
(Insert table here)
Training Target Dataset (Subsurface Temperature)
GLORYS Global Ocean Reanalysis
https://doi.org/10.48670/moi-00021
Variables: Temperature
In-situ Observations Dataset
Gridded ARGO
INCOIS Live Access Server (LAS) – Gridded ARGO
Expected Solution
End-to-end preprocessing pipeline for satellite and ocean datasets.
Satellite embedding engine capable of learning latent ocean representations from
surface observations.
Deep learning reconstruction model for estimating subsurface temperature.
Standardized output at daily temporal resolution and 0.25° spatial resolution.
Validation framework using independent ARGO observations.
Demonstration of a working Proof-of-Concept (PoC) over the Bay of Bengal / Arabian Sea.

---

## SIH26067 — Develop a web-based interactive 3D visualization platform that integrates numerical ocean model outputs and in-situ observations.
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: Indian National Centre for Ocean Information Services (INCOIS) Ocean Valley
- Dataset: The following dataset links are missing and should be included:
a. Numerical Ocean Model Outputs: https://las.incois.gov.in/ & https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description
b. Argo Global Data: ftp://ftp.ifremer.fr/ifremer/argo
c. Glider Data: ftp://ftp.ifremer.fr/ifremer/glider/v2/
d. Collection of In-situ Data:

Background
India's vast Exclusive Economic Zone (EEZ) and coastline demand continuous, high-resolution monitoring of ocean state variables. INCOIS routinely generates and archives large volumes of ocean model outputs - including three-dimensional fields of temperature, salinity, current vectors, chlorophyll, etc. - as well as real-time and delayed-mode observations from autonomous instruments such as Argo profiling floats and underwater Gliders. These datasets are stored in NetCDF and ASCII/text formats and span multiple depth levels, spatial grids, and time steps.
Despite the richness of this data, no integrated, web-based 3D visualization platform currently exists that can simultaneously render model fields and in-situ instrument observations in a single interactive environment. Existing tools are either desktop-bound, support only 2D plan views, or lack the ability to co-visualize model outputs alongside instrument profiles. Operational oceanographers and forecasters are therefore forced to toggle between disparate software packages, making it difficult to rapidly correlate model predictions with observational evidence.
Key gaps identified include:
No web-based, platform-independent 3D rendering of ocean model data
(temperature, salinity, currents, etc.) with depth-resolved volumetric views.
No unified display of Argo float and Glider profile data
(latitude, longitude, depth, time, temperature, salinity, chlorophyll)
alongside model fields.
Absence of interactive controls for variable selection, depth-slice navigation,
time-step animation, and customizable colorbars.
Inability to ingest new observational data streams or additional model variables
without significant re-engineering.
Lack of tools to support intuitive, rapid understanding of complex 3D ocean
phenomena for operational decision-making.
The absence of such a system impedes timely hazard assessment, search-and-rescue support,
fishery advisories, climate monitoring, etc. - all operational mandates of INCOIS.
Expected Solution
The proposed solution is a web-based, browser-native 3D Ocean Data Visualization System
that integrates ocean model outputs with observational data on a single interactive platform.
Core functional requirements:
3D Volumetric Rendering:
Interactive visualization of ocean model fields
(temperature, salinity, current vectors) across the full water column,
with support for depth-slice views, isosurface extraction, and time-step
animation using WebGL / Three.js or Cesium.js.
Instrument Data Overlay:
Co-display of Argo float, Glider profile, CTD and BGC data using
geospatially accurate markers; users can click a float/glider to inspect
a depth-vs-variable profile chart with timestamps.
Multi-format Data Ingestion:
Automated parsers for NetCDF (via PyNIO / xarray backend) and delimited
text formats, with a modular architecture that allows new variables or
data sources to be added with minimal code change.
Customizable Colorbar &amp; Variable Controls:
Dynamic colorbar editor (color palette, min/max range, log/linear scale),
variable selector, layer opacity controls, and vertical exaggeration slider
for intuitive depth perception.
Web-based, Scalable Architecture:
Frontend built on modern JavaScript frameworks with a lightweight
REST/OPeNDAP API backend, enabling deployment on INCOIS infrastructure
without any client-side dependencies.
Extensible Design:
Plugin-style module for future integration of additional sensors
(e.g., CTDs, moorings, HF-radar, Acoustic Doppler Current Profiler (ADCP), etc.),
new ocean model variables, and machine-learning derived products.
The system will follow open standards
( OGC WMS/WCS, CF Conventions for NetCDF ),
enabling interoperability with national and international ocean data portals.
The end product will empower INCOIS forecasters to perform rapid, intuitive analysis
of complex 3D ocean phenomena - significantly improving the speed and accuracy of
operational advisories, in the same way that 3D meteorological visualization has
transformed weather forecasting workflows.
Public Outreach &amp; Science Communication
Beyond operational use, the platform will serve as a powerful science communication tool.
Complex numerical ocean model outputs - which are typically inaccessible to non-specialists -
can be transformed into visually intuitive, interactive 3D experiences.
This makes the tool valuable for educating school and college students about ocean dynamics,
engaging the general public during awareness campaigns, and supporting policymakers in
understanding marine environmental conditions.
INCOIS can use the platform for outreach events, exhibitions, and e-learning initiatives,
bridging the gap between cutting-edge ocean science and the common person.
-->
Background
India's vast Exclusive Economic Zone (EEZ) and coastline demand continuous, high-resolution monitoring of ocean state variables. INCOIS routinely generates and archives large volumes of ocean model outputs - including three-dimensional fields of temperature, salinity, current vectors, chlorophyll, etc. - as well as real-time and delayed-mode observations from autonomous instruments such as Argo profiling floats and underwater Gliders. These datasets are stored in NetCDF and ASCII/text formats and span multiple depth levels, spatial grids, and time steps.
Despite the richness of this data, no integrated, web-based 3D visualization platform currently exists that can simultaneously render model fields and in-situ instrument observations in a single interactive environment. Existing tools are either desktop-bound, support only 2D plan views, or lack the ability to co-visualize model outputs alongside instrument profiles. Operational oceanographers and forecasters are therefore forced to toggle between disparate software packages, making it difficult to rapidly correlate model predictions with observational evidence.
Key gaps identified include:
No web-based, platform-independent 3D rendering of ocean model data
(temperature, salinity, currents, etc.) with depth-resolved volumetric views.
No unified display of Argo float and Glider profile data
(latitude, longitude, depth, time, temperature, salinity, chlorophyll)
alongside model fields.
Absence of interactive controls for variable selection, depth-slice navigation,
time-step animation, and customizable colorbars.
Inability to ingest new observational data streams or additional model variables
without significant re-engineering.
Lack of tools to support intuitive, rapid understanding of complex 3D ocean
phenomena for operational decision-making.
The absence of such a system impedes timely hazard assessment, search-and-rescue support,
fishery advisories, climate monitoring, etc. - all operational mandates of INCOIS.
Expected Solution
The proposed solution is a web-based, browser-native 3D Ocean Data Visualization System
that integrates ocean model outputs with observational data on a single interactive platform.
Core functional requirements:
3D Volumetric Rendering:
Interactive visualization of ocean model fields
(temperature, salinity, current vectors) across the full water column,
with support for depth-slice views, isosurface extraction, and time-step
animation using WebGL / Three.js or Cesium.js.
Instrument Data Overlay:
Co-display of Argo float, Glider profile, CTD and BGC data using
geospatially accurate markers; users can click a float/glider to inspect
a depth-vs-variable profile chart with timestamps.
Multi-format Data Ingestion:
Automated parsers for NetCDF (via PyNIO / xarray backend) and delimited
text formats, with a modular architecture that allows new variables or
data sources to be added with minimal code change.
Customizable Colorbar & Variable Controls:
Dynamic colorbar editor (color palette, min/max range, log/linear scale),
variable selector, layer opacity controls, and vertical exaggeration slider
for intuitive depth perception.
Web-based, Scalable Architecture:
Frontend built on modern JavaScript frameworks with a lightweight
REST/OPeNDAP API backend, enabling deployment on INCOIS infrastructure
without any client-side dependencies.
Extensible Design:
Plugin-style module for future integration of additional sensors
(e.g., CTDs, moorings, HF-radar, Acoustic Doppler Current Profiler (ADCP), etc.),
new ocean model variables, and machine-learning derived products.
The system will follow open standards
( OGC WMS/WCS, CF Conventions for NetCDF ),
enabling interoperability with national and international ocean data portals.
The end product will empower INCOIS forecasters to perform rapid, intuitive analysis
of complex 3D ocean phenomena - significantly improving the speed and accuracy of
operational advisories, in the same way that 3D meteorological visualization has
transformed weather forecasting workflows.
Public Outreach & Science Communication
Beyond operational use, the platform will serve as a powerful science communication tool.
Complex numerical ocean model outputs - which are typically inaccessible to non-specialists -
can be transformed into visually intuitive, interactive 3D experiences.
This makes the tool valuable for educating school and college students about ocean dynamics,
engaging the general public during awareness campaigns, and supporting policymakers in
understanding marine environmental conditions.
INCOIS can use the platform for outreach events, exhibitions, and e-learning initiatives,
bridging the gap between cutting-edge ocean science and the common person.

---

## SIH26068 — WeatherGPT: Conversational AI for Weather Forecasting, Alerts, and Climate Information
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

&#8226; Background Weather information is often distributed through multiple portals, bulletins, satellite products, and forecast systems, making it difficult for common users, researchers, disaster managers, and government agencies to quickly obtain actionable insights. There is a need for an intelligent conversational platform that can provide real-time weather information, forecasts, warnings, climate analysis, and decision support in natural language. &#8226; Objective Develop an AI-powered chatbot platform named WeatherGPT that integrates meteorological datasets, forecasting models, and disaster warning systems to provide accurate, contextual, and multilingual weather intelligence through conversational interfaces. &#8226; Key Features 1. Real-time weather information retrieval. 2. Natural language querying for weather forecasts. 3. Integration with numerical weather prediction (NWP) models such as GFS/WRF. 4. Extreme weather alerts and early warning dissemination. 5. Location-based forecasting and advisory generation. 6. Multilingual support for Indian languages. 7. Climate trend and historical weather analysis. 8. Voice-enabled interaction for rural accessibility. &#8226; Expected Solution Participants should develop: &#8226; A mobile-based conversational AI platform. &#8226; Backend integration with meteorological databases, website and APIs. &#8226; AI/LLM-based query understanding engine. &#8226; Scalable architecture supporting real-time data ingestion. &#8226; Suggested Technology Stack &#8226; Python / FastAPI / Node.js &#8226; MQTT / WIS2.0 / WebSocket &#8226; LLMs (OpenAI, Llama, Gemini, etc.) &#8226; GIS tools and weather APIs &#8226; PostgreSQL / MongoDB &#8226; Docker / Kubernetes &#8226; Expected Outcomes &#8226; Faster dissemination of weather information. &#8226; Improved public accessibility to forecasts. &#8226; Better disaster preparedness and response. &#8226; Intelligent weather decision-support system for agriculture, aviation, marine, and urban planning. &#8226; Possible Use Cases &#8226; Farmers seeking crop-weather advisories. &#8226; Aviation weather briefing. &#8226; Flood/cyclone warning dissemination. &#8226; Smart city weather monitoring. &#8226; Climate analytics for researchers. &#8226; Evaluation Parameters &#8226; Accuracy and relevance. &#8226; Response latency. &#8226; Multilingual capability. &#8226; User interface and accessibility. &#8226; Scalability and innovation. &#8226; Integration with real-time meteorological systems. &#8226; Voice-enabled interaction for rural accessibility -->
- Background Weather information is often distributed through multiple portals, bulletins, satellite products, and forecast systems, making it difficult for common users, researchers, disaster managers, and government agencies to quickly obtain actionable insights. There is a need for an intelligent conversational platform that can provide real-time weather information, forecasts, warnings, climate analysis, and decision support in natural language. - Objective Develop an AI-powered chatbot platform named WeatherGPT that integrates meteorological datasets, forecasting models, and disaster warning systems to provide accurate, contextual, and multilingual weather intelligence through conversational interfaces. - Key Features 1. Real-time weather information retrieval. 2. Natural language querying for weather forecasts. 3. Integration with numerical weather prediction (NWP) models such as GFS/WRF. 4. Extreme weather alerts and early warning dissemination. 5. Location-based forecasting and advisory generation. 6. Multilingual support for Indian languages. 7. Climate trend and historical weather analysis. 8. Voice-enabled interaction for rural accessibility. - Expected Solution Participants should develop: - A mobile-based conversational AI platform. - Backend integration with meteorological databases, website and APIs. - AI/LLM-based query understanding engine. - Scalable architecture supporting real-time data ingestion. - Suggested Technology Stack - Python / FastAPI / Node.js - MQTT / WIS2.0 / WebSocket - LLMs (OpenAI, Llama, Gemini, etc.) - GIS tools and weather APIs - PostgreSQL / MongoDB - Docker / Kubernetes - Expected Outcomes - Faster dissemination of weather information. - Improved public accessibility to forecasts. - Better disaster preparedness and response. - Intelligent weather decision-support system for agriculture, aviation, marine, and urban planning. - Possible Use Cases - Farmers seeking crop-weather advisories. - Aviation weather briefing. - Flood/cyclone warning dissemination. - Smart city weather monitoring. - Climate analytics for researchers. - Evaluation Parameters - Accuracy and relevance. - Response latency. - Multilingual capability. - User interface and accessibility. - Scalability and innovation. - Integration with real-time meteorological systems. - Voice-enabled interaction for rural accessibility

---

## SIH26069 — National Weather Big Data Analytics Platform
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

Design and develop a scalable National Weather Big Data Analytics Platform capable of collecting and processing real-time weather-related information for India from multiple internet-based sources including social media platforms, public datasets, websites, APIs, and citizen reports. The platform should automatically collect weather related posts and information tagged with #IMD and other relevant weather hashtags, along with metadata such as date &amp; time, city, state, GPS location, photos, videos, and event category, and store the information in a centralized database. The system should leverage big data technologies and open-source tools to support large-scale real-time data ingestion, processing, storage, and visualization. Participants are encouraged to use machine learning and AI-based techniques to identify fake or misleading reports, verify untrusted sources, remove duplicate entries, and automatically categorize weather events such as rainfall, thunderstorms, flooding, heatwaves, fog, dust storms, and strong winds. Develop a web-based dashboard and Admin Panel for monitoring and analysing collected data with features including: &#8226; Date-wise filtering &#8226; Event-wise filtering &#8226; Location-wise filtering &#8226; Verification status tracking &#8226; Real-time visualization and analytics -->
Design and develop a scalable National Weather Big Data Analytics Platform capable of collecting and processing real-time weather-related information for India from multiple internet-based sources including social media platforms, public datasets, websites, APIs, and citizen reports. The platform should automatically collect weather related posts and information tagged with #IMD and other relevant weather hashtags, along with metadata such as date & time, city, state, GPS location, photos, videos, and event category, and store the information in a centralized database. The system should leverage big data technologies and open-source tools to support large-scale real-time data ingestion, processing, storage, and visualization. Participants are encouraged to use machine learning and AI-based techniques to identify fake or misleading reports, verify untrusted sources, remove duplicate entries, and automatically categorize weather events such as rainfall, thunderstorms, flooding, heatwaves, fog, dust storms, and strong winds. Develop a web-based dashboard and Admin Panel for monitoring and analysing collected data with features including: - Date-wise filtering - Event-wise filtering - Location-wise filtering - Verification status tracking - Real-time visualization and analytics

---

## SIH26070 — To develop an Artificial Intelligence (AI) / Machine Learning (ML) based system for identification, classification, and prediction of different tropical cyclone patterns using multi-source satellite data.
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

To develop an Artificial Intelligence (AI) / Machine Learning (ML) based system for identification, classification, and prediction of different tropical cyclone patterns using multi-source satellite data. -->
To develop an Artificial Intelligence (AI) / Machine Learning (ML) based system for identification, classification, and prediction of different tropical cyclone patterns using multi-source satellite data.

---

## SIH26071 — AI/ML-Based Integrated heavy rainfall Early Warning and Inundation Prediction System using Satellite, Radar, observational Weather and numerical weather prediction model data.
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

AI/ML-Based Integrated heavy rainfall Early Warning and Inundation Prediction System using Satellite, Radar, observational Weather and numerical weather prediction model data. -->
AI/ML-Based Integrated heavy rainfall Early Warning and Inundation Prediction System using Satellite, Radar, observational Weather and numerical weather prediction model data.

---

## SIH26072 — AIML based Nowcasting of thunderstorm and lightning using atmospheric observation including multiple radars, satellite, lightning and model data.
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

AIML based Nowcasting of thunderstorm and lightning using atmospheric observation including multiple radars, satellite, lightning and model data. -->
AIML based Nowcasting of thunderstorm and lightning using atmospheric observation including multiple radars, satellite, lightning and model data.

---

## SIH26073 — AI/ML-Based Intelligent Anomaly Detection for Automatic Weather Stations (AWS)
- Category: Software | Theme: Disaster Management
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

&#8226; Title SkyGuard AI: Intelligent Real-Time Anomaly Detection System for Temperature, Pressure, and Humidity Sensors in Automatic Weather Stations &#8226; Background Automatic Weather Stations (AWS) are critical components of modern meteorological observation networks. These stations continuously monitor atmospheric parameters and provide real-time data for weather forecasting, climate monitoring, disaster management, aviation, agriculture, and scientific research.However, AWS observations often contain anomalies caused by sensor malfunction,communication failures, calibration drift, power fluctuations, harsh environmental conditions, and data corruption.Erroneous observations can significantly impact weather forecasting accuracy and decision-making systems. Traditional threshold-based quality control methods are often insufficient for identifying complex or hidden anomalies in meteorological data streams. &#8226; Problem Statement Develop an AI/ML-based intelligent anomaly detection system capable of automatically identifying abnormal, inconsistent, or faulty observations from Automatic Weather Stations in real time using only the following parameters: &#8226; Temperature (Â°C) &#8226; Atmospheric Pressure (hPa) &#8226; Relative Humidity (%) The system should distinguish between genuine meteorological events and sensor/data anomalies while minimizing false alarms and enabling scalable deployment across large weather observation networks. &#8226; Objectives &#8226; Detect anomalies in real-time AWS data streams. &#8226; Identify sensor faults, spikes, frozen values, and communication errors. &#8226; Learn normal temporal and seasonal patterns of temperature, pressure, and humidity. &#8226; Perform multivariate consistency analysis among atmospheric parameters. &#8226; Provide confidence scores and explainable AI-based reasoning for detected anomalies. &#8226; Predict possible sensor degradation and maintenance requirements. &#8226; Optionally suggest corrected/imputed values for anomalous observations. &#8226; Expected Inputs Participants may use historical AWS datasets, simulated anomalies, or streaming sensor data containing the following meteorological parameters: Parameter- Unit Temperature - Â°C Atmospheric Pressure - hPa Relative Humidity - % &#8226; Expected Outputs &#8226; Real-time anomaly alerts &#8226; Severity and confidence scores &#8226; Root-cause classification &#8226; Visualization dashboard &#8226; Sensor health status &#8226; Corrected data estimation (optional) &#8226; Suggested Technologies &#8226; Explainable AI (SHAP/LIME) (Preferable) &#8226; Edge AI for low-power deployment on ESP32 &#8226; Evaluation Criteria (To be evaluated in anomaly injected data) Criteria - Weightage Innovation &amp; Novelty - 25% Detection Accuracy - 20% Real-Time Capability - 15% Explainability - 10% Scalability - 10% Practical Deployability - 10% Visualization/UI - 5% Energy Efficiency - 5% &#8226; Example Use Case An AWS suddenly reports a temperature of 55Â°C with extremely high humidity and abnormal pressure variation while neighboring stations show normal conditions. The AI system should analyze temporal and spatial consistency, identify the reading as a probable sensor anomaly, generate an alert, and suggest corrective action. &#8226; Grand Challenge Can AI build a self-aware and self-healing weather observation network capable of delivering trustworthy atmospheric data under all environmental conditions? &#8226; Output: Fully executable code with example usage and a document explaining various use cases -->
- Title SkyGuard AI: Intelligent Real-Time Anomaly Detection System for Temperature, Pressure, and Humidity Sensors in Automatic Weather Stations - Background Automatic Weather Stations (AWS) are critical components of modern meteorological observation networks. These stations continuously monitor atmospheric parameters and provide real-time data for weather forecasting, climate monitoring, disaster management, aviation, agriculture, and scientific research.However, AWS observations often contain anomalies caused by sensor malfunction,communication failures, calibration drift, power fluctuations, harsh environmental conditions, and data corruption.Erroneous observations can significantly impact weather forecasting accuracy and decision-making systems. Traditional threshold-based quality control methods are often insufficient for identifying complex or hidden anomalies in meteorological data streams. - Problem Statement Develop an AI/ML-based intelligent anomaly detection system capable of automatically identifying abnormal, inconsistent, or faulty observations from Automatic Weather Stations in real time using only the following parameters: - Temperature (Â°C) - Atmospheric Pressure (hPa) - Relative Humidity (%) The system should distinguish between genuine meteorological events and sensor/data anomalies while minimizing false alarms and enabling scalable deployment across large weather observation networks. - Objectives - Detect anomalies in real-time AWS data streams. - Identify sensor faults, spikes, frozen values, and communication errors. - Learn normal temporal and seasonal patterns of temperature, pressure, and humidity. - Perform multivariate consistency analysis among atmospheric parameters. - Provide confidence scores and explainable AI-based reasoning for detected anomalies. - Predict possible sensor degradation and maintenance requirements. - Optionally suggest corrected/imputed values for anomalous observations. - Expected Inputs Participants may use historical AWS datasets, simulated anomalies, or streaming sensor data containing the following meteorological parameters: Parameter- Unit Temperature - Â°C Atmospheric Pressure - hPa Relative Humidity - % - Expected Outputs - Real-time anomaly alerts - Severity and confidence scores - Root-cause classification - Visualization dashboard - Sensor health status - Corrected data estimation (optional) - Suggested Technologies - Explainable AI (SHAP/LIME) (Preferable) - Edge AI for low-power deployment on ESP32 - Evaluation Criteria (To be evaluated in anomaly injected data) Criteria - Weightage Innovation & Novelty - 25% Detection Accuracy - 20% Real-Time Capability - 15% Explainability - 10% Scalability - 10% Practical Deployability - 10% Visualization/UI - 5% Energy Efficiency - 5% - Example Use Case An AWS suddenly reports a temperature of 55Â°C with extremely high humidity and abnormal pressure variation while neighboring stations show normal conditions. The AI system should analyze temporal and spatial consistency, identify the reading as a probable sensor anomaly, generate an alert, and suggest corrective action. - Grand Challenge Can AI build a self-aware and self-healing weather observation network capable of delivering trustworthy atmospheric data under all environmental conditions? - Output: Fully executable code with example usage and a document explaining various use cases

---

## SIH26074 — Downscaling of weather forecast from Block level to Panchayat level: Inferring high-resolution plots/ data/ information from low-resolution plot /data /information /variables for agro-meteorological advisory services.
- Category: Software | Theme: Agriculture, FoodTech & Rural Development
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

Downscaling of weather forecast from Block level to Panchayat level: Inferring high-resolution plots/ data/ information from low-resolution plot /data /information /variables for agro-meteorological advisory services. -->
Downscaling of weather forecast from Block level to Panchayat level: Inferring high-resolution plots/ data/ information from low-resolution plot /data /information /variables for agro-meteorological advisory services.

---

## SIH26075 — Participants are invited to design and develop **CAPACITY CONNECT A Digital Capacity Building and Learning Management Portal** to support organizational training, competency development, and knowledge sharing through a centralized web-based platform.
- Category: Software | Theme: Smart Education
- Org: Ministry of Earth Sciences (MoES) | Dept: India Meteorological Department

The solution should include secure signup and login functionality with three user roles: Trainee, Trainer, and Admin. Trainees should be able to create professional profiles with qualifications, work experience, interests, skills, and certificates, enroll in courses, access learning resources, attempt subject-wise MCQ assessments, and provide feedback on courses and training content.Trainers should be able to manage their profiles, create questionnaires with deadlines, monitor trainee participation and performance, and upload recorded lectures, presentations, and study materials in a trainer library accessible to trainees.The Admin module should provide user approval and role management features along with dashboards for monitoring courses, enrollments, certifications,assessments, and participation statistics. Admins should also be able to publish notifications, announcements, achievements, and newly added learning content on the homepage.The platform should support competency mapping for identifying suitable trainers for various subjects and should be scalable, secure, user-friendly, and accessible across devices to promote efficient learning and organizational capacity building. -->
The solution should include secure signup and login functionality with three user roles: Trainee, Trainer, and Admin. Trainees should be able to create professional profiles with qualifications, work experience, interests, skills, and certificates, enroll in courses, access learning resources, attempt subject-wise MCQ assessments, and provide feedback on courses and training content.Trainers should be able to manage their profiles, create questionnaires with deadlines, monitor trainee participation and performance, and upload recorded lectures, presentations, and study materials in a trainer library accessible to trainees.The Admin module should provide user approval and role management features along with dashboards for monitoring courses, enrollments, certifications,assessments, and participation statistics. Admins should also be able to publish notifications, announcements, achievements, and newly added learning content on the homepage.The platform should support competency mapping for identifying suitable trainers for various subjects and should be scalable, secure, user-friendly, and accessible across devices to promote efficient learning and organizational capacity building.

---

