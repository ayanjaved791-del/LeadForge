<?php
declare(strict_types=1);

namespace LeadForge\Services;

/** Business categories → OpenStreetMap tag filters. */
final class Categories
{
    /** @var array<string,array{label:string,tags:list<array{0:string,1:string}>}> */
    public const ALL = [
        'restaurant'     => ['label' => 'Restaurants',          'tags' => [['amenity', 'restaurant'], ['amenity', 'fast_food']]],
        'cafe'           => ['label' => 'Cafes',                'tags' => [['amenity', 'cafe']]],
        'hotel'          => ['label' => 'Hotels',               'tags' => [['tourism', 'hotel'], ['tourism', 'guest_house'], ['tourism', 'motel']]],
        'clinic'         => ['label' => 'Clinics',              'tags' => [['amenity', 'clinic'], ['healthcare', 'clinic'], ['amenity', 'doctors']]],
        'hospital'       => ['label' => 'Hospitals',            'tags' => [['amenity', 'hospital']]],
        'dentist'        => ['label' => 'Dentists',             'tags' => [['amenity', 'dentist'], ['healthcare', 'dentist']]],
        'school'         => ['label' => 'Schools',              'tags' => [['amenity', 'school']]],
        'university'     => ['label' => 'Universities',         'tags' => [['amenity', 'university'], ['amenity', 'college']]],
        'clothing'       => ['label' => 'Clothing stores',      'tags' => [['shop', 'clothes'], ['shop', 'boutique']]],
        'supermarket'    => ['label' => 'Supermarkets',         'tags' => [['shop', 'supermarket']]],
        'gym'            => ['label' => 'Gyms',                 'tags' => [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']]],
        'salon'          => ['label' => 'Salons',               'tags' => [['shop', 'hairdresser'], ['shop', 'beauty']]],
        'real_estate'    => ['label' => 'Real estate agencies', 'tags' => [['office', 'estate_agent'], ['shop', 'estate_agent']]],
        'car_dealership' => ['label' => 'Car dealerships',      'tags' => [['shop', 'car']]],
        'travel_agency'  => ['label' => 'Travel agencies',      'tags' => [['shop', 'travel_agency'], ['office', 'travel_agent']]],
        'furniture'      => ['label' => 'Furniture stores',     'tags' => [['shop', 'furniture']]],
        'electronics'    => ['label' => 'Electronics stores',   'tags' => [['shop', 'electronics'], ['shop', 'computer'], ['shop', 'mobile_phone']]],
        'law_firm'       => ['label' => 'Law firms',            'tags' => [['office', 'lawyer']]],
    ];

    public static function exists(string $key): bool { return isset(self::ALL[$key]); }

    /** @return list<array{key:string,label:string}> */
    public static function list(): array
    {
        $out = [];
        foreach (self::ALL as $k => $c) $out[] = ['key' => $k, 'label' => $c['label']];
        return $out;
    }
}
